"""
Pydantic v2 schemas for lectures and materials.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Lecture ────────────────────────────────────────────────────────────

class LectureCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    video_url: str = Field(description="Supabase Storage path")
    order_index: int = 0


class LectureUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    order_index: int | None = None


class LectureDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    module_id: UUID
    title: str
    description: str | None
    video_url: str
    signed_video_url: str | None = None
    duration_seconds: int | None
    transcript: str | None
    summary: str | None
    status: str
    order_index: int
    created_at: datetime
    updated_at: datetime


# ── Material ──────────────────────────────────────────────────────────

class MaterialCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    type: str = Field(pattern="^(pdf|youtube|link|file)$")
    file_url: str | None = None
    external_url: str | None = None
    order_index: int = 0


class MaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    module_id: UUID
    title: str
    type: str
    file_url: str | None
    external_url: str | None
    order_index: int


# ── Upload ────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    file_url: str
    signed_url: str
    bucket: str
    path: str
    lecture_id: UUID | None = None
