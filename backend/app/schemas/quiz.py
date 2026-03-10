"""
Pydantic schemas for quizzes and quiz attempts.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Quiz ──────────────────────────────────────────────────────────────

class QuizGenerateRequest(BaseModel):
    source_type: str = Field(..., pattern="^(lecture|material)$")
    source_id: str
    num_questions: int = Field(10, ge=1, le=50)
    bloom_levels: list[str] = Field(
        default=["remember", "understand", "apply"],
    )
    is_adaptive: bool = False
    title: str | None = None
    course_id: str
    module_id: str | None = None


class QuizGenerateResponse(BaseModel):
    quiz_id: str
    status: str = "generating"


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    quiz_id: str
    type: str
    question_text: str
    options: list[str] | None = None
    correct_answer: str
    explanation: str
    bloom_level: str
    difficulty: int
    concept_tag: str


class QuestionStudentView(BaseModel):
    """Question view for students — no correct answer or explanation."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    quiz_id: str
    type: str
    question_text: str
    options: list[str] | None = None
    bloom_level: str
    difficulty: int
    concept_tag: str


class QuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    module_id: str | None
    title: str
    generated_from: str
    is_adaptive: bool
    is_published: bool
    created_by: str
    created_at: datetime
    questions: list[QuestionResponse] = []


class QuizListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    title: str
    generated_from: str
    is_adaptive: bool
    is_published: bool
    question_count: int = 0
    created_at: datetime


# ── Attempts ──────────────────────────────────────────────────────────

class AttemptCreateResponse(BaseModel):
    id: str
    quiz_id: str
    started_at: datetime


class AnswerRequest(BaseModel):
    question_id: str
    student_answer: str
    time_taken_seconds: int | None = None


class AnswerResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: str
    mastery_update: dict | None = None


class AttemptResultResponse(BaseModel):
    id: str
    quiz_id: str
    score: float | None
    started_at: datetime
    completed_at: datetime | None
    mastery_data: dict | None
    total_questions: int
    correct_count: int
    responses: list[QuestionResponseDetail] = []


class QuestionResponseDetail(BaseModel):
    question_id: str
    question_text: str
    question_type: str
    student_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str
    concept_tag: str


class QuizUpdateRequest(BaseModel):
    title: str | None = None
    is_published: bool | None = None


class QuestionUpdateRequest(BaseModel):
    question_text: str | None = None
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    difficulty: int | None = None
    concept_tag: str | None = None
