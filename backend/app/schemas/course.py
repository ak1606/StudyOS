"""
Pydantic v2 schemas for courses, modules, and enrollments.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserResponse


# ── Course ────────────────────────────────────────────────────────────

class CourseCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None


class CourseUpdate(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    description: str | None = None
    cover_image_url: str | None = None
    is_published: bool | None = None


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    teacher_id: UUID
    cover_image_url: str | None
    is_published: bool
    enrollment_code: str
    created_at: datetime
    updated_at: datetime


class CourseListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    cover_image_url: str | None
    is_published: bool
    enrollment_code: str
    created_at: datetime


# ── Module ────────────────────────────────────────────────────────────

class ModuleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    order_index: int = 0


class ModuleUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    order_index: int | None = None


class MaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    module_id: UUID
    title: str
    type: str
    file_url: str | None
    external_url: str | None
    order_index: int


class LectureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    module_id: UUID
    title: str
    description: str | None
    video_url: str
    duration_seconds: int | None
    status: str
    order_index: int
    created_at: datetime


class ModuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    title: str
    description: str | None
    order_index: int
    lectures: list[LectureResponse] = []
    materials: list[MaterialResponse] = []


# ── Course Detail (includes modules, teacher) ────────────────────────

class CourseDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    teacher_id: UUID
    cover_image_url: str | None
    is_published: bool
    enrollment_code: str
    created_at: datetime
    updated_at: datetime
    teacher: UserResponse
    modules: list[ModuleResponse] = []
    enrollment_count: int = 0


# ── Enrollment ────────────────────────────────────────────────────────

class EnrollRequest(BaseModel):
    enrollment_code: str = Field(min_length=6, max_length=6)


class EnrollmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    student_id: UUID
    enrolled_at: datetime
    status: str
