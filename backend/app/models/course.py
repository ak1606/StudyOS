"""
Course and CourseModule ORM models.
"""

import enum
import secrets
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


def _generate_enrollment_code() -> str:
    """Generate a random 6-character alphanumeric enrollment code."""
    return secrets.token_hex(3).upper()  # 6 hex chars


class Course(Base):
    __tablename__ = "courses"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enrollment_code: Mapped[str] = mapped_column(
        String(6), unique=True, nullable=False, default=_generate_enrollment_code
    )

    # ── Relationships ─────────────────────────────────────────────────
    teacher = relationship("User", back_populates="courses_teaching", lazy="selectin")
    modules = relationship(
        "CourseModule",
        back_populates="course",
        lazy="selectin",
        order_by="CourseModule.order_index",
        cascade="all, delete-orphan",
    )
    enrollments = relationship(
        "Enrollment", back_populates="course", lazy="selectin", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Course {self.title!r}>"


class CourseModule(Base):
    __tablename__ = "course_modules"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────
    course = relationship("Course", back_populates="modules")
    lectures = relationship(
        "Lecture",
        back_populates="module",
        lazy="selectin",
        order_by="Lecture.order_index",
        cascade="all, delete-orphan",
    )
    materials = relationship(
        "Material",
        back_populates="module",
        lazy="selectin",
        order_by="Material.order_index",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<CourseModule {self.title!r}>"
