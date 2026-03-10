"""
Pydantic schemas for notifications and announcements.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Notifications ─────────────────────────────────────────────────────

class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    type: str
    title: str
    body: str
    is_read: bool
    action_url: str | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


# ── Announcements ─────────────────────────────────────────────────────

class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    scheduled_at: datetime | None = None


class AnnouncementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    author_id: str
    title: str
    body: str
    scheduled_at: datetime | None
    sent_at: datetime | None
    created_at: datetime


class AnnouncementDraftRequest(BaseModel):
    intent: str = Field(min_length=1, max_length=500)
    course_id: str


class AnnouncementDraftResponse(BaseModel):
    title: str
    body: str
