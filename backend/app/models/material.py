"""
Material ORM model.

Types: pdf, youtube, link, file.
"""

import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MaterialType(str, enum.Enum):
    pdf = "pdf"
    youtube = "youtube"
    link = "link"
    file = "file"


class Material(Base):
    __tablename__ = "materials"

    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_modules.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[MaterialType] = mapped_column(
        Enum(MaterialType, name="material_type", create_constraint=True),
        nullable=False,
    )
    file_url: Mapped[str | None] = mapped_column(
        String(512), nullable=True, comment="Supabase Storage path"
    )
    external_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Relationships ─────────────────────────────────────────────────
    module = relationship("CourseModule", back_populates="materials")

    def __repr__(self) -> str:
        return f"<Material {self.title!r} type={self.type.value}>"
