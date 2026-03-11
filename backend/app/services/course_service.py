"""
Course service — business logic for courses, modules, enrollments.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.course import Course, CourseModule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole
from app.schemas.course import (
    CourseCreate,
    CourseDetailResponse,
    CourseUpdate,
    ModuleCreate,
    ModuleUpdate,
)


# ── Courses ───────────────────────────────────────────────────────────

async def create_course(db: AsyncSession, data: CourseCreate, teacher: User) -> Course:
    course = Course(**data.model_dump(), teacher_id=teacher.id)
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


async def list_courses(
    db: AsyncSession,
    user: User,
    skip: int = 0,
    limit: int = 50,
) -> list[Course]:
    """
    Teachers see their own courses.
    Students see published courses they are enrolled in.
    Admins see everything.
    """
    stmt = select(Course)

    if user.role == UserRole.teacher:
        stmt = stmt.where(Course.teacher_id == user.id)
    elif user.role == UserRole.student:
        enrolled_ids = (
            select(Enrollment.course_id)
            .where(Enrollment.student_id == user.id)
            .where(Enrollment.status == EnrollmentStatus.active)
        )
        stmt = stmt.where(
            (Course.is_published == True) | (Course.id.in_(enrolled_ids))  # noqa: E712
        )
    # admin: no filter

    stmt = stmt.order_by(Course.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_course_by_id(db: AsyncSession, course_id: UUID) -> Course | None:
    stmt = (
        select(Course)
        .options(
            selectinload(Course.teacher),
            selectinload(Course.modules)
            .selectinload(CourseModule.lectures),
            selectinload(Course.modules)
            .selectinload(CourseModule.materials),
            selectinload(Course.enrollments),
        )
        .where(Course.id == course_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_course_detail(db: AsyncSession, course_id: UUID) -> CourseDetailResponse:
    course = await get_course_by_id(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    resp = CourseDetailResponse.model_validate(course)
    resp.enrollment_count = len(course.enrollments)
    return resp


async def update_course(
    db: AsyncSession, course_id: UUID, data: CourseUpdate, teacher: User
) -> Course:
    course = await get_course_by_id(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != teacher.id and teacher.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not your course")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(course, field, value)

    await db.commit()
    await db.refresh(course)
    return course


async def delete_course(db: AsyncSession, course_id: UUID, teacher: User) -> None:
    course = await get_course_by_id(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != teacher.id and teacher.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not your course")

    await db.delete(course)
    await db.commit()


# ── Enrollment ────────────────────────────────────────────────────────

async def enroll_by_code(
    db: AsyncSession, enrollment_code: str, student: User
) -> Enrollment:
    """Look up a course by enrollment_code, then enroll the student."""
    stmt = select(Course).where(Course.enrollment_code == enrollment_code)
    result = await db.execute(stmt)
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Invalid enrollment code")
    return await enroll_student(db, course.id, enrollment_code, student)


async def enroll_student(
    db: AsyncSession, course_id: UUID, enrollment_code: str, student: User
) -> Enrollment:
    course = await get_course_by_id(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.enrollment_code != enrollment_code:
        raise HTTPException(status_code=400, detail="Invalid enrollment code")

    # Check duplicate
    stmt = select(Enrollment).where(
        Enrollment.course_id == course_id,
        Enrollment.student_id == student.id,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Already enrolled")

    enrollment = Enrollment(course_id=course_id, student_id=student.id)
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)
    return enrollment


# ── Modules ───────────────────────────────────────────────────────────

async def create_module(
    db: AsyncSession, course_id: UUID, data: ModuleCreate, teacher: User
) -> CourseModule:
    course = await get_course_by_id(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != teacher.id and teacher.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not your course")

    # Auto-set order_index if not provided
    if data.order_index == 0:
        count_result = await db.execute(
            select(func.count()).where(CourseModule.course_id == course_id)
        )
        data.order_index = count_result.scalar() or 0

    module = CourseModule(**data.model_dump(), course_id=course_id)
    db.add(module)
    await db.commit()
    await db.refresh(module)
    return module


async def update_module(
    db: AsyncSession, module_id: UUID, data: ModuleUpdate, teacher: User
) -> CourseModule:
    stmt = (
        select(CourseModule)
        .options(selectinload(CourseModule.course))
        .where(CourseModule.id == module_id)
    )
    result = await db.execute(stmt)
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.course.teacher_id != teacher.id and teacher.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not your course")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(module, field, value)

    await db.commit()
    await db.refresh(module)
    return module


async def delete_module(db: AsyncSession, module_id: UUID, teacher: User) -> None:
    stmt = (
        select(CourseModule)
        .options(selectinload(CourseModule.course))
        .where(CourseModule.id == module_id)
    )
    result = await db.execute(stmt)
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.course.teacher_id != teacher.id and teacher.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not your course")

    await db.delete(module)
    await db.commit()
