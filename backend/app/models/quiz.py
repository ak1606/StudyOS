"""
Quiz ORM models — AI-generated quizzes with adaptive assessment.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class GeneratedFrom(str, enum.Enum):
    lecture = "lecture"
    material = "material"
    manual = "manual"


class QuestionType(str, enum.Enum):
    mcq = "mcq"
    true_false = "true_false"
    short_answer = "short_answer"


class BloomLevel(str, enum.Enum):
    remember = "remember"
    understand = "understand"
    apply = "apply"
    analyze = "analyze"


class Quiz(Base):
    __tablename__ = "quizzes"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False,
    )
    module_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("course_modules.id", ondelete="SET NULL"), nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    generated_from: Mapped[GeneratedFrom] = mapped_column(
        Enum(GeneratedFrom, name="generated_from", create_constraint=True), nullable=False,
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True,
    )
    is_adaptive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )

    # Relationships
    course = relationship("Course", lazy="selectin")
    module = relationship("CourseModule", lazy="selectin")
    creator = relationship("User", lazy="selectin")
    questions = relationship(
        "Question", back_populates="quiz", lazy="selectin",
        cascade="all, delete-orphan", order_by="Question.id",
    )

    def __repr__(self) -> str:
        return f"<Quiz {self.title!r}>"


class Question(Base):
    __tablename__ = "questions"

    quiz_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False,
    )
    type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, name="question_type", create_constraint=True), nullable=False,
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    bloom_level: Mapped[BloomLevel] = mapped_column(
        Enum(BloomLevel, name="bloom_level", create_constraint=True), nullable=False,
    )
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    concept_tag: Mapped[str] = mapped_column(String(100), nullable=False, default="general")

    # Relationships
    quiz = relationship("Quiz", back_populates="questions")

    def __repr__(self) -> str:
        return f"<Question {self.type.value} d={self.difficulty}>"


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    quiz_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mastery_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    # Relationships
    quiz = relationship("Quiz", lazy="selectin")
    student = relationship("User", lazy="selectin")
    responses = relationship(
        "QuestionResponse", back_populates="attempt", lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<QuizAttempt quiz={self.quiz_id} score={self.score}>"


class QuestionResponse(Base):
    __tablename__ = "question_responses"

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False,
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False,
    )
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    attempt = relationship("QuizAttempt", back_populates="responses")
    question = relationship("Question", lazy="selectin")

    def __repr__(self) -> str:
        return f"<QuestionResponse correct={self.is_correct}>"
