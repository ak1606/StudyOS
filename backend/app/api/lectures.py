"""
Lectures API router.

POST  /api/modules/{id}/lectures
GET   /api/lectures/{id}
PUT   /api/lectures/{id}
DELETE /api/lectures/{id}
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_teacher
from app.core.supabase_client import get_signed_url
from app.models.course import CourseModule
from app.models.lecture import Lecture, LectureStatus
from app.models.user import User
from app.schemas.lecture import LectureCreate, LectureDetailResponse, LectureUpdate

router = APIRouter()


@router.post(
    "/modules/{module_id}/lectures",
    response_model=LectureDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_lecture(
    module_id: UUID,
    body: LectureCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> LectureDetailResponse:
    """Add a lecture to a module (teacher only). Usually called after upload."""
    # Verify module exists and teacher owns it
    stmt = (
        select(CourseModule)
        .options(selectinload(CourseModule.course))
        .where(CourseModule.id == module_id)
    )
    result = await db.execute(stmt)
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.course.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your course")

    # Auto order_index
    if body.order_index == 0:
        count_result = await db.execute(
            select(func.count()).where(Lecture.module_id == module_id)
        )
        body.order_index = count_result.scalar() or 0

    lecture = Lecture(**body.model_dump(), module_id=module_id)
    db.add(lecture)
    await db.commit()
    await db.refresh(lecture)
    return LectureDetailResponse.model_validate(lecture)


@router.get("/{lecture_id}", response_model=LectureDetailResponse)
async def get_lecture(
    lecture_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LectureDetailResponse:
    """Get lecture detail with transcript, summary, and signed video URL."""
    stmt = select(Lecture).where(Lecture.id == lecture_id)
    result = await db.execute(stmt)
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    resp = LectureDetailResponse.model_validate(lecture)
    # Generate a signed URL for the video
    try:
        resp.signed_video_url = get_signed_url("lectures", lecture.video_url)
    except Exception:
        resp.signed_video_url = None
    return resp


@router.put("/{lecture_id}", response_model=LectureDetailResponse)
async def update_lecture(
    lecture_id: UUID,
    body: LectureUpdate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> LectureDetailResponse:
    """Update lecture metadata (teacher only)."""
    stmt = (
        select(Lecture)
        .options(selectinload(Lecture.module).selectinload(CourseModule.course))
        .where(Lecture.id == lecture_id)
    )
    result = await db.execute(stmt)
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    if lecture.module.course.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your course")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lecture, field, value)

    await db.commit()
    await db.refresh(lecture)
    return LectureDetailResponse.model_validate(lecture)


@router.delete("/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lecture(
    lecture_id: UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> None:
    """Delete a lecture (teacher only)."""
    stmt = (
        select(Lecture)
        .options(selectinload(Lecture.module).selectinload(CourseModule.course))
        .where(Lecture.id == lecture_id)
    )
    result = await db.execute(stmt)
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    if lecture.module.course.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your course")

    await db.delete(lecture)
    await db.commit()
