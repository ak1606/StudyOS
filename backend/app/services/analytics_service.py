"""
Analytics service — student progress, course overview, risk prediction.
"""

from __future__ import annotations

import logging
from uuid import UUID

import ollama as _ollama
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.analytics import EngagementScore, LectureView
from app.models.course import Course, CourseModule
from app.models.enrollment import Enrollment
from app.models.lecture import Lecture
from app.models.quiz import Question, QuestionResponse, QuizAttempt
from app.models.user import User

logger = logging.getLogger(__name__)


async def get_student_progress(
    student_id: UUID,
    course_id: UUID,
    db: AsyncSession,
) -> dict:
    """
    Compute detailed student progress for a course.
    """
    # 1. Lecture completion percentage
    # Get all lectures in the course
    lecture_ids_result = await db.execute(
        select(Lecture.id).join(CourseModule).where(CourseModule.course_id == course_id)
    )
    lecture_ids = list(lecture_ids_result.scalars().all())
    total_lectures = len(lecture_ids)

    completed_result = await db.execute(
        select(func.count()).where(
            LectureView.student_id == student_id,
            LectureView.lecture_id.in_(lecture_ids),
            LectureView.completed.is_(True),
        )
    ) if lecture_ids else None
    completed_lectures = completed_result.scalar() if completed_result else 0
    lectures_completed_pct = round(
        (completed_lectures / total_lectures * 100) if total_lectures > 0 else 0, 1
    )

    # 2. Average quiz score
    quiz_scores_result = await db.execute(
        select(func.avg(QuizAttempt.score)).where(
            QuizAttempt.student_id == student_id,
            QuizAttempt.score.isnot(None),
        )
    )
    avg_quiz_score = round(quiz_scores_result.scalar() or 0, 1)

    # 3. Engagement trend (last 4 weeks)
    engagement_result = await db.execute(
        select(EngagementScore.total_score)
        .where(
            EngagementScore.student_id == student_id,
            EngagementScore.course_id == course_id,
        )
        .order_by(EngagementScore.week_start.desc())
        .limit(4)
    )
    engagement_trend = list(reversed(
        [float(s) for s in engagement_result.scalars().all()]
    ))
    if not engagement_trend:
        engagement_trend = [0.0]

    # 4. Concept mastery from quiz attempt mastery_data
    mastery_result = await db.execute(
        select(QuizAttempt.mastery_data)
        .where(
            QuizAttempt.student_id == student_id,
            QuizAttempt.mastery_data.isnot(None),
        )
        .order_by(QuizAttempt.started_at.desc())
        .limit(5)
    )
    concept_mastery = {}
    for mastery_data in mastery_result.scalars().all():
        if not mastery_data:
            continue
        for concept, data in mastery_data.items():
            if concept not in concept_mastery:
                concept_mastery[concept] = {"correct": 0, "total": 0}
            concept_mastery[concept]["correct"] += data.get("correct", 0)
            concept_mastery[concept]["total"] += data.get("total", 0)

    concept_list = [
        {
            "concept": c,
            "pct": round(d["correct"] / d["total"] * 100, 1) if d["total"] > 0 else 0,
        }
        for c, d in concept_mastery.items()
    ]

    # 5. Risk level and predicted grade
    risk_level = predict_risk_score(lectures_completed_pct, avg_quiz_score, engagement_trend)
    predicted_grade = _grade_from_score(avg_quiz_score)

    # 6. AI coach message
    try:
        coach_prompt = (
            f"Student progress: {lectures_completed_pct}% lectures completed, "
            f"average quiz score {avg_quiz_score}%, risk level: {risk_level}. "
            f"Write 2-3 sentences of personalized study advice. Be encouraging and specific."
        )
        coach_response = _ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=[{"role": "user", "content": coach_prompt}],
        )
        coach_message = coach_response["message"]["content"].strip()
    except Exception:
        coach_message = "Keep up the great work! Focus on the areas where you scored lower."

    return {
        "lectures_completed_pct": lectures_completed_pct,
        "avg_quiz_score": avg_quiz_score,
        "engagement_trend": engagement_trend,
        "concept_mastery": concept_list,
        "predicted_grade": predicted_grade,
        "risk_level": risk_level,
        "coach_message": coach_message,
    }


async def get_course_overview(
    course_id: UUID,
    db: AsyncSession,
) -> dict:
    """
    Compute course-level analytics overview for teachers.
    """
    # Total students
    student_count_result = await db.execute(
        select(func.count()).where(Enrollment.course_id == course_id)
    )
    total_students = student_count_result.scalar() or 0

    # Average quiz score across all students
    avg_result = await db.execute(
        select(func.avg(QuizAttempt.score)).where(
            QuizAttempt.score.isnot(None),
        )
    )
    avg_score = round(avg_result.scalar() or 0, 1)

    # Get enrolled students with their scores
    enrollments_result = await db.execute(
        select(Enrollment).where(Enrollment.course_id == course_id)
    )
    enrollments = enrollments_result.scalars().all()

    at_risk_students = []
    for enrollment in enrollments:
        student = enrollment.student
        if not student:
            continue

        # Get student's quiz avg for this course
        student_avg_result = await db.execute(
            select(func.avg(QuizAttempt.score)).where(
                QuizAttempt.student_id == student.id,
                QuizAttempt.score.isnot(None),
            )
        )
        student_avg = round(student_avg_result.scalar() or 0, 1)

        # Get lecture completion
        lecture_ids_result = await db.execute(
            select(Lecture.id).join(CourseModule).where(CourseModule.course_id == course_id)
        )
        lecture_ids = list(lecture_ids_result.scalars().all())
        total_lectures = len(lecture_ids)

        if total_lectures > 0:
            completed_result = await db.execute(
                select(func.count()).where(
                    LectureView.student_id == student.id,
                    LectureView.lecture_id.in_(lecture_ids),
                    LectureView.completed.is_(True),
                )
            )
            completion_pct = round(completed_result.scalar() / total_lectures * 100, 1)
        else:
            completion_pct = 0.0

        risk = predict_risk_score(completion_pct, student_avg, [])
        if risk in ("medium", "high"):
            at_risk_students.append({
                "student_id": str(student.id),
                "full_name": student.full_name,
                "risk_level": risk,
                "avg_score": student_avg,
                "completion_pct": completion_pct,
            })

    # Lecture engagement
    lecture_engagement = []
    lectures_result = await db.execute(
        select(Lecture).join(CourseModule).where(CourseModule.course_id == course_id)
    )
    for lecture in lectures_result.scalars().all():
        views_result = await db.execute(
            select(
                func.count(),
                func.avg(
                    case(
                        (LectureView.total_seconds > 0,
                         LectureView.watched_seconds * 100.0 / LectureView.total_seconds),
                        else_=0,
                    )
                ),
            ).where(LectureView.lecture_id == lecture.id)
        )
        row = views_result.one()
        lecture_engagement.append({
            "lecture_id": str(lecture.id),
            "title": lecture.title,
            "views": row[0] or 0,
            "avg_completion_pct": round(float(row[1] or 0), 1),
        })

    # Confused concepts (low mastery across students)
    confused_concepts: list[dict] = []
    all_mastery: dict[str, dict] = {}
    for enrollment in enrollments:
        mastery_result = await db.execute(
            select(QuizAttempt.mastery_data)
            .where(
                QuizAttempt.student_id == enrollment.student_id,
                QuizAttempt.mastery_data.isnot(None),
            )
            .order_by(QuizAttempt.started_at.desc())
            .limit(3)
        )
        for m in mastery_result.scalars().all():
            if not m:
                continue
            for concept, data in m.items():
                if concept not in all_mastery:
                    all_mastery[concept] = {"correct": 0, "total": 0}
                all_mastery[concept]["correct"] += data.get("correct", 0)
                all_mastery[concept]["total"] += data.get("total", 0)

    for concept, data in all_mastery.items():
        pct = round(data["correct"] / data["total"] * 100, 1) if data["total"] > 0 else 0
        if pct < 60:
            confused_concepts.append({"concept": concept, "pct": pct})
    confused_concepts.sort(key=lambda x: x["pct"])

    return {
        "total_students": total_students,
        "avg_score": avg_score,
        "at_risk_students": at_risk_students,
        "lecture_engagement": lecture_engagement,
        "confused_concepts": confused_concepts,
    }


def predict_risk_score(completion_pct: float, quiz_avg: float, engagement_trend: list[float]) -> str:
    """
    Predict risk level: score = engagement*0.4 + quiz_avg*0.4 + completion*0.2
    high < 45, medium < 65, else low
    """
    avg_engagement = sum(engagement_trend) / len(engagement_trend) if engagement_trend else 50.0
    score = avg_engagement * 0.4 + quiz_avg * 0.4 + completion_pct * 0.2

    if score < 45:
        return "high"
    elif score < 65:
        return "medium"
    return "low"


def _grade_from_score(score: float) -> str:
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    return "F"
