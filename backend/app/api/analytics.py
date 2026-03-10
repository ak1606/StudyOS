"""
Analytics API router.

GET  /api/analytics/student/{course_id}
GET  /api/analytics/course/{course_id}
GET  /api/analytics/course/{course_id}/insight
POST /api/analytics/lecture/{id}/view
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_student, require_teacher
from app.models.analytics import ClassInsight, LectureView
from app.models.user import User
from app.schemas.analytics import (
    ClassInsightResponse,
    CourseOverviewResponse,
    LectureViewRequest,
    LectureViewResponse,
    StudentProgressResponse,
)
from app.services import analytics_service

router = APIRouter()


@router.get("/student/{course_id}", response_model=StudentProgressResponse)
async def get_student_progress(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
) -> StudentProgressResponse:
    """Get detailed progress for the current student in a course."""
    data = await analytics_service.get_student_progress(student.id, course_id, db)
    return StudentProgressResponse(**data)


@router.get("/course/{course_id}", response_model=CourseOverviewResponse)
async def get_course_overview(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> CourseOverviewResponse:
    """Get course-level analytics overview (teachers only)."""
    data = await analytics_service.get_course_overview(course_id, db)
    return CourseOverviewResponse(**data)


@router.get("/course/{course_id}/insight", response_model=ClassInsightResponse | None)
async def get_latest_insight(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> ClassInsightResponse | None:
    """Get the latest AI-generated class insight."""
    result = await db.execute(
        select(ClassInsight)
        .where(ClassInsight.course_id == course_id)
        .order_by(ClassInsight.created_at.desc())
        .limit(1)
    )
    insight = result.scalar_one_or_none()
    if not insight:
        return None

    return ClassInsightResponse(
        id=str(insight.id),
        course_id=str(insight.course_id),
        week_start=insight.week_start,
        insight_text=insight.insight_text,
        created_at=insight.created_at,
    )


@router.post("/lecture/{lecture_id}/view", response_model=LectureViewResponse)
async def track_lecture_view(
    lecture_id: UUID,
    body: LectureViewRequest,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
) -> LectureViewResponse:
    """Track lecture viewing progress."""
    # Upsert: find existing or create new
    result = await db.execute(
        select(LectureView).where(
            LectureView.lecture_id == lecture_id,
            LectureView.student_id == student.id,
        )
    )
    view = result.scalar_one_or_none()

    if view:
        # Update with highest watched time
        view.watched_seconds = max(view.watched_seconds, body.watched_seconds)
        view.total_seconds = body.total_seconds
        view.completed = view.watched_seconds >= body.total_seconds * 0.9
    else:
        view = LectureView(
            lecture_id=lecture_id,
            student_id=student.id,
            watched_seconds=body.watched_seconds,
            total_seconds=body.total_seconds,
            completed=body.watched_seconds >= body.total_seconds * 0.9,
        )
        db.add(view)

    await db.commit()
    await db.refresh(view)

    return LectureViewResponse(
        lecture_id=str(view.lecture_id),
        watched_seconds=view.watched_seconds,
        total_seconds=view.total_seconds,
        completed=view.completed,
    )
