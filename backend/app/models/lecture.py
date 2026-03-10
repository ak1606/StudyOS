"""
Lecture ORM model.

Status lifecycle: pending → processing → ready | failed
"""

import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LectureStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class Lecture(Base):
    __tablename__ = "lectures"

    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_modules.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_url: Mapped[str] = mapped_column(
        String(512), nullable=False, comment="Supabase Storage path"
    )
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[LectureStatus] = mapped_column(
        Enum(LectureStatus, name="lecture_status", create_constraint=True),
        default=LectureStatus.pending,
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────
    module = relationship("CourseModule", back_populates="lectures")

    def __repr__(self) -> str:
        return f"<Lecture {self.title!r} status={self.status.value}>"
