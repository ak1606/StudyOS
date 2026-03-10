"""
Enrollment ORM model — links students to courses.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class EnrollmentStatus(str, enum.Enum):
    active = "active"
    dropped = "dropped"
    completed = "completed"


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("course_id", "student_id", name="uq_enrollment"),
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    status: Mapped[EnrollmentStatus] = mapped_column(
        Enum(EnrollmentStatus, name="enrollment_status", create_constraint=True),
        default=EnrollmentStatus.active,
        nullable=False,
    )

    # ── Relationships ─────────────────────────────────────────────────
    course = relationship("Course", back_populates="enrollments")
    student = relationship("User", back_populates="enrollments")

    def __repr__(self) -> str:
        return f"<Enrollment student={self.student_id} course={self.course_id}>"
