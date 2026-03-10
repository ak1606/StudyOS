"""
Analytics ORM models — lecture views, engagement scores, class insights.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LectureView(Base):
    __tablename__ = "lecture_views"

    lecture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_watched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # Relationships
    lecture = relationship("Lecture", lazy="selectin")
    student = relationship("User", lazy="selectin")

    def __repr__(self) -> str:
        return f"<LectureView lecture={self.lecture_id} pct={self.watched_seconds}/{self.total_seconds}>"


class EngagementScore(Base):
    __tablename__ = "engagement_scores"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False,
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    watch_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    quiz_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discussion_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Relationships
    student = relationship("User", lazy="selectin")
    course = relationship("Course", lazy="selectin")

    def __repr__(self) -> str:
        return f"<EngagementScore student={self.student_id} total={self.total_score}>"


class ClassInsight(Base):
    __tablename__ = "class_insights"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False,
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    insight_text: Mapped[str] = mapped_column(Text, nullable=False)
    raw_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    # Relationships
    course = relationship("Course", lazy="selectin")

    def __repr__(self) -> str:
        return f"<ClassInsight course={self.course_id} week={self.week_start}>"
