"""
Materials API router.

POST   /api/modules/{id}/materials
DELETE /api/materials/{id}
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_teacher
from app.models.course import CourseModule
from app.models.material import Material, MaterialType
from app.models.user import User
from app.schemas.lecture import MaterialCreate, MaterialResponse

router = APIRouter()


@router.post(
    "/modules/{module_id}/materials",
    response_model=MaterialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_material(
    module_id: UUID,
    body: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> MaterialResponse:
    """Add a material to a module (teacher only)."""
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
            select(func.count()).where(Material.module_id == module_id)
        )
        body.order_index = count_result.scalar() or 0

    material = Material(
        module_id=module_id,
        title=body.title,
        type=MaterialType(body.type),
        file_url=body.file_url,
        external_url=body.external_url,
        order_index=body.order_index,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return MaterialResponse.model_validate(material)


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    material_id: UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> None:
    """Delete a material (teacher only)."""
    stmt = (
        select(Material)
        .options(selectinload(Material.module).selectinload(CourseModule.course))
        .where(Material.id == material_id)
    )
    result = await db.execute(stmt)
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    if material.module.course.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your course")

    await db.delete(material)
    await db.commit()
