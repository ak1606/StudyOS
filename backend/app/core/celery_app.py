from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "lms_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# ── Celery configuration ─────────────────────────────────────────────
celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,

    # Result expiry (24 hours)
    result_expires=86400,
)

# ── Auto-discover task modules ────────────────────────────────────────
celery_app.autodiscover_tasks(
    [
        "app.tasks.transcription",
        "app.tasks.embeddings",
        "app.tasks.quiz_generation",
        "app.tasks.notifications",
    ]
)

# ── Celery Beat schedule ──────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    # Send personalized notifications every day at 08:00 UTC
    "daily-notifications": {
        "task": "app.tasks.notifications.send_personalized_notifications",
        "schedule": crontab(hour=8, minute=0),
    },
    # Generate weekly class insights every Monday at 06:00 UTC
    "weekly-class-insight": {
        "task": "app.tasks.notifications.generate_weekly_class_insight",
        "schedule": crontab(hour=6, minute=0, day_of_week=1),
    },
    # Send scheduled announcements every 5 minutes
    "send-scheduled-announcements": {
        "task": "app.tasks.notifications.send_scheduled_announcements",
        "schedule": crontab(minute="*/5"),
    },
}
