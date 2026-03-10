"""
Courses API router.

POST   /api/courses
GET    /api/courses
GET    /api/courses/{id}
PUT    /api/courses/{id}
DELETE /api/courses/{id}
POST   /api/courses/{id}/enroll
POST   /api/courses/{id}/modules
PUT    /api/modules/{id}
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_student, require_teacher
from app.models.user import User
from app.schemas.course import (
    CourseCreate,
    CourseDetailResponse,
    CourseListResponse,
    CourseResponse,
    CourseUpdate,
    EnrollmentResponse,
    EnrollRequest,
    ModuleCreate,
    ModuleResponse,
    ModuleUpdate,
)
from app.services import course_service

router = APIRouter()


# ── Courses ───────────────────────────────────────────────────────────


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    body: CourseCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> CourseResponse:
    """Create a new course (teachers only)."""
    course = await course_service.create_course(db, body, teacher)
    return CourseResponse.model_validate(course)


@router.get("", response_model=list[CourseListResponse])
async def list_courses(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CourseListResponse]:
    """List courses visible to the current user."""
    courses = await course_service.list_courses(db, current_user, skip, limit)
    return [CourseListResponse.model_validate(c) for c in courses]


@router.get("/{course_id}", response_model=CourseDetailResponse)
async def get_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CourseDetailResponse:
    """Get full course detail (modules + lectures + materials)."""
    return await course_service.get_course_detail(db, course_id)


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: UUID,
    body: CourseUpdate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> CourseResponse:
    """Update a course (owner teacher only)."""
    course = await course_service.update_course(db, course_id, body, teacher)
    return CourseResponse.model_validate(course)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> None:
    """Delete a course (owner teacher only)."""
    await course_service.delete_course(db, course_id, teacher)


# ── Enrollment ────────────────────────────────────────────────────────


@router.post(
    "/{course_id}/enroll",
    response_model=EnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def enroll(
    course_id: UUID,
    body: EnrollRequest,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
) -> EnrollmentResponse:
    """Enroll in a course with an enrollment code (students only)."""
    enrollment = await course_service.enroll_student(
        db, course_id, body.enrollment_code, student
    )
    return EnrollmentResponse.model_validate(enrollment)


# ── Modules ───────────────────────────────────────────────────────────


@router.post(
    "/{course_id}/modules",
    response_model=ModuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_module(
    course_id: UUID,
    body: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> ModuleResponse:
    """Add a new module to a course (teacher only)."""
    module = await course_service.create_module(db, course_id, body, teacher)
    return ModuleResponse.model_validate(module)


@router.put("/modules/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: UUID,
    body: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> ModuleResponse:
    """Update a module (teacher only)."""
    module = await course_service.update_module(db, module_id, body, teacher)
    return ModuleResponse.model_validate(module)


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(
    module_id: UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> None:
    """Delete a module (teacher only)."""
    await course_service.delete_module(db, module_id, teacher)
