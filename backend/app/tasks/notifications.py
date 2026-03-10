"""
Celery tasks — notifications, announcements, and weekly insights.

Scheduled by Celery Beat (see celery_app.py).
"""

import logging
from datetime import date, datetime, timedelta, timezone

import ollama as _ollama
from sqlalchemy import func

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SyncSessionLocal
from app.models.analytics import ClassInsight, EngagementScore
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.notification import Announcement, Notification, NotificationType
from app.models.quiz import QuizAttempt

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.tasks.notifications.send_personalized_notifications")
def send_personalized_notifications(self) -> None:
    """
    Daily task: send personalized study reminders based on engagement data.

    Checks each active enrollment:
      - no quiz attempts this week → reminder
      - engagement score < 50 → alert
      - quiz avg >= 90 → congratulation
    """
    logger.info("Running daily personalized notifications task")
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    with SyncSessionLocal() as db:
        try:
            enrollments = db.query(Enrollment).filter(
                Enrollment.status == "active"
            ).all()

            notifications_created = 0

            for enrollment in enrollments:
                student_id = enrollment.student_id
                course_id = enrollment.course_id

                # Check quiz attempts this week
                recent_attempts = db.query(QuizAttempt).filter(
                    QuizAttempt.student_id == student_id,
                    QuizAttempt.started_at >= week_ago,
                ).count()

                if recent_attempts == 0:
                    notif = Notification(
                        user_id=student_id,
                        type=NotificationType.reminder,
                        title="Time to take a quiz! 📝",
                        body="You haven't attempted any quizzes this week. Regular practice helps retention!",
                        action_url=f"/dashboard/student/courses/{course_id}",
                    )
                    db.add(notif)
                    notifications_created += 1

                # Check engagement score
                latest_engagement = (
                    db.query(EngagementScore)
                    .filter(
                        EngagementScore.student_id == student_id,
                        EngagementScore.course_id == course_id,
                    )
                    .order_by(EngagementScore.week_start.desc())
                    .first()
                )

                if latest_engagement and latest_engagement.total_score < 50:
                    notif = Notification(
                        user_id=student_id,
                        type=NotificationType.alert,
                        title="Your engagement is dropping ⚠️",
                        body="Your activity this week is lower than usual. Try watching a lecture or reviewing notes.",
                        action_url=f"/dashboard/student/courses/{course_id}",
                    )
                    db.add(notif)
                    notifications_created += 1

                # Check for high performers
                avg_result = db.query(func.avg(QuizAttempt.score)).filter(
                    QuizAttempt.student_id == student_id,
                    QuizAttempt.score.isnot(None),
                    QuizAttempt.started_at >= week_ago,
                ).scalar()

                if avg_result and avg_result >= 90:
                    notif = Notification(
                        user_id=student_id,
                        type=NotificationType.ai_insight,
                        title="Outstanding performance! 🌟",
                        body=f"Your average quiz score this week is {round(avg_result, 1)}%. Keep up the amazing work!",
                    )
                    db.add(notif)
                    notifications_created += 1

            db.commit()
            logger.info("Created %d personalized notifications", notifications_created)

        except Exception as e:
            logger.error("Failed to send personalized notifications: %s", e)
            db.rollback()
    logger.info("Daily notifications task completed")


@celery_app.task(bind=True, name="app.tasks.notifications.generate_weekly_class_insight")
def generate_weekly_class_insight(self) -> None:
    """
    Weekly task (Monday): generate AI-powered class insights per course.

    Gathers stats and asks Ollama to write a 3-paragraph teacher insight.
    """
    logger.info("Running weekly class insight generation")

    with SyncSessionLocal() as db:
        try:
            courses = db.query(Course).filter(Course.is_published.is_(True)).all()

            for course in courses:
                enrollment_count = db.query(Enrollment).filter(
                    Enrollment.course_id == course.id
                ).count()

                if enrollment_count == 0:
                    continue

                avg_score = db.query(func.avg(QuizAttempt.score)).filter(
                    QuizAttempt.score.isnot(None),
                ).scalar() or 0

                stats_text = (
                    f"Course: {course.title}\n"
                    f"Total students: {enrollment_count}\n"
                    f"Average quiz score: {round(avg_score, 1)}%\n"
                )

                try:
                    response = _ollama.chat(
                        model=settings.OLLAMA_MODEL,
                        messages=[
                            {
                                "role": "system",
                                "content": "You are an educational analytics assistant.",
                            },
                            {
                                "role": "user",
                                "content": (
                                    f"Based on these course statistics, write a 3-paragraph insight:\n"
                                    f"(1) Overall performance summary\n"
                                    f"(2) Students who may need attention\n"
                                    f"(3) Recommended teaching actions\n\n"
                                    f"{stats_text}"
                                ),
                            },
                        ],
                    )
                    insight_text = response["message"]["content"].strip()
                except Exception as e:
                    logger.error("Ollama insight generation failed: %s", e)
                    insight_text = (
                        f"Weekly summary for {course.title}: "
                        f"{enrollment_count} students enrolled, "
                        f"average score {round(avg_score, 1)}%."
                    )

                today = date.today()
                week_start = today - timedelta(days=today.weekday())

                insight = ClassInsight(
                    course_id=course.id,
                    week_start=week_start,
                    insight_text=insight_text,
                    raw_data={
                        "enrollment_count": enrollment_count,
                        "avg_score": round(avg_score, 1),
                    },
                )
                db.add(insight)

            db.commit()
            logger.info("Generated weekly insights for %d courses", len(courses))

        except Exception as e:
            logger.error("Weekly insight generation failed: %s", e)
            db.rollback()
    logger.info("Weekly insight generation completed")


@celery_app.task(bind=True, name="app.tasks.notifications.send_scheduled_announcements")
def send_scheduled_announcements(self) -> None:
    """
    Every 5 min: send announcements whose scheduled_at has passed.

    Creates Notification rows for all enrolled students, sets sent_at = now.
    """
    logger.info("Checking for scheduled announcements")
    now = datetime.now(timezone.utc)

    with SyncSessionLocal() as db:
        try:
            pending = db.query(Announcement).filter(
                Announcement.scheduled_at <= now,
                Announcement.sent_at.is_(None),
            ).all()

            total_notifs = 0
            for announcement in pending:
                enrollments = db.query(Enrollment).filter(
                    Enrollment.course_id == announcement.course_id,
                    Enrollment.status == "active",
                ).all()

                for enrollment in enrollments:
                    notif = Notification(
                        user_id=enrollment.student_id,
                        type=NotificationType.announcement,
                        title=announcement.title,
                        body=announcement.body,
                        action_url=f"/dashboard/student/courses/{announcement.course_id}",
                    )
                    db.add(notif)
                    total_notifs += 1

                announcement.sent_at = now

            db.commit()
            if pending:
                logger.info(
                    "Sent %d announcements, created %d notifications",
                    len(pending), total_notifs,
                )

        except Exception as e:
            logger.error("Failed to send scheduled announcements: %s", e)
            db.rollback()
