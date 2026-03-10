"""
Notifications & Announcements API router.

GET    /api/notifications
PUT    /api/notifications/{id}/read
PUT    /api/notifications/read-all
POST   /api/courses/{id}/announcements
GET    /api/courses/{id}/announcements
POST   /api/announcements/draft
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import ollama as _ollama
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_teacher
from app.models.enrollment import Enrollment
from app.models.notification import Announcement, Notification, NotificationType
from app.models.user import User
from app.schemas.notification import (
    AnnouncementCreate,
    AnnouncementDraftRequest,
    AnnouncementDraftResponse,
    AnnouncementResponse,
    NotificationListResponse,
    NotificationResponse,
)

router = APIRouter()


# ── Notifications ─────────────────────────────────────────────────────


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    """List recent notifications for the current user."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    notifications = result.scalars().all()

    unread_result = await db.execute(
        select(func.count()).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    )
    unread_count = unread_result.scalar() or 0

    return NotificationListResponse(
        items=[
            NotificationResponse(
                id=str(n.id),
                user_id=str(n.user_id),
                type=n.type.value,
                title=n.title,
                body=n.body,
                is_read=n.is_read,
                action_url=n.action_url,
                created_at=n.created_at,
            )
            for n in notifications
        ],
        unread_count=unread_count,
    )


@router.put("/notifications/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Mark a notification as read."""
    notif = await db.get(Notification, notification_id)
    if not notif or notif.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.commit()
    return {"status": "read"}


@router.put("/notifications/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Mark all notifications as read for the current user."""
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    )
    for notif in result.scalars().all():
        notif.is_read = True
    await db.commit()
    return {"status": "all_read"}


# ── Announcements ─────────────────────────────────────────────────────


@router.post("/courses/{course_id}/announcements", response_model=AnnouncementResponse)
async def create_announcement(
    course_id: UUID,
    body: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> AnnouncementResponse:
    """Create an announcement for a course."""
    announcement = Announcement(
        course_id=course_id,
        author_id=teacher.id,
        title=body.title,
        body=body.body,
        scheduled_at=body.scheduled_at,
    )
    db.add(announcement)

    # If no scheduling, send immediately
    if not body.scheduled_at:
        announcement.sent_at = datetime.now(timezone.utc)
        await db.flush()

        # Create notifications for enrolled students
        enrollments_result = await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course_id,
                Enrollment.status == "active",
            )
        )
        for enrollment in enrollments_result.scalars().all():
            notif = Notification(
                user_id=enrollment.student_id,
                type=NotificationType.announcement,
                title=body.title,
                body=body.body,
                action_url=f"/dashboard/student/courses/{course_id}",
            )
            db.add(notif)

    await db.commit()
    await db.refresh(announcement)

    return AnnouncementResponse(
        id=str(announcement.id),
        course_id=str(announcement.course_id),
        author_id=str(announcement.author_id),
        title=announcement.title,
        body=announcement.body,
        scheduled_at=announcement.scheduled_at,
        sent_at=announcement.sent_at,
        created_at=announcement.created_at,
    )


@router.get("/courses/{course_id}/announcements", response_model=list[AnnouncementResponse])
async def list_announcements(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AnnouncementResponse]:
    """List announcements for a course."""
    result = await db.execute(
        select(Announcement)
        .where(Announcement.course_id == course_id)
        .order_by(Announcement.created_at.desc())
    )
    return [
        AnnouncementResponse(
            id=str(a.id),
            course_id=str(a.course_id),
            author_id=str(a.author_id),
            title=a.title,
            body=a.body,
            scheduled_at=a.scheduled_at,
            sent_at=a.sent_at,
            created_at=a.created_at,
        )
        for a in result.scalars().all()
    ]


@router.post("/announcements/draft", response_model=AnnouncementDraftResponse)
async def draft_announcement(
    body: AnnouncementDraftRequest,
    _teacher: User = Depends(require_teacher),
) -> AnnouncementDraftResponse:
    """Use AI to draft an announcement from an intent string."""
    try:
        response = _ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a course announcement writer. "
                        "Return ONLY valid JSON: {\"title\": \"...\", \"body\": \"...\"}. "
                        "No markdown. No explanation."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Draft a course announcement. Intent: {body.intent}",
                },
            ],
        )

        import json

        raw = response["message"]["content"].strip()
        # Strip markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        if raw.endswith("```"):
            raw = raw[: raw.rfind("```")]

        data = json.loads(raw.strip())
        return AnnouncementDraftResponse(
            title=data.get("title", "Announcement"),
            body=data.get("body", body.intent),
        )

    except Exception:
        return AnnouncementDraftResponse(
            title="Course Announcement",
            body=body.intent,
        )
