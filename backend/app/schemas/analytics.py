"""
Pydantic schemas for analytics endpoints.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


# ── Student progress ──────────────────────────────────────────────────

class ConceptMastery(BaseModel):
    concept: str
    pct: float


class StudentProgressResponse(BaseModel):
    lectures_completed_pct: float
    avg_quiz_score: float
    engagement_trend: list[float]
    concept_mastery: list[ConceptMastery]
    predicted_grade: str
    risk_level: str
    coach_message: str


# ── Course overview ───────────────────────────────────────────────────

class AtRiskStudent(BaseModel):
    student_id: str
    full_name: str
    risk_level: str
    avg_score: float
    completion_pct: float


class LectureEngagement(BaseModel):
    lecture_id: str
    title: str
    views: int
    avg_completion_pct: float


class CourseOverviewResponse(BaseModel):
    total_students: int
    avg_score: float
    at_risk_students: list[AtRiskStudent]
    lecture_engagement: list[LectureEngagement]
    confused_concepts: list[ConceptMastery]


# ── Class insight ─────────────────────────────────────────────────────

class ClassInsightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    course_id: str
    week_start: date
    insight_text: str
    created_at: datetime


# ── Lecture view tracking ─────────────────────────────────────────────

class LectureViewRequest(BaseModel):
    watched_seconds: int
    total_seconds: int


class LectureViewResponse(BaseModel):
    lecture_id: str
    watched_seconds: int
    total_seconds: int
    completed: bool


# ── Engagement scores ─────────────────────────────────────────────────

class EngagementScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    student_id: str
    course_id: str
    week_start: date
    watch_score: float
    quiz_score: float
    discussion_score: float
    total_score: float
