"""
ContentChunk ORM model — stores vector-embedded text chunks.

Uses pgvector for the embedding column (768 dimensions, nomic-embed-text).
Each chunk links back to a course and a specific source (lecture/material).
"""

import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class SourceType(str, enum.Enum):
    lecture_transcript = "lecture_transcript"
    material_pdf = "material_pdf"
    lecture_summary = "lecture_summary"


class ContentChunk(Base):
    __tablename__ = "content_chunks"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_type: Mapped[SourceType] = mapped_column(
        Enum(SourceType, name="source_type", create_constraint=True),
        nullable=False,
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        comment="FK to lectures.id or materials.id depending on source_type",
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(768), nullable=False)
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True, default=dict
    )

    # ── Relationships ─────────────────────────────────────────────────
    course = relationship("Course", lazy="selectin")

    # ── Indexes ───────────────────────────────────────────────────────
    __table_args__ = (
        Index(
            "ix_content_chunks_embedding",
            "embedding",
            postgresql_using="ivfflat",
            postgresql_with={"lists": 100},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("ix_content_chunks_course_source", "course_id", "source_type", "source_id"),
    )

    def __repr__(self) -> str:
        return f"<ContentChunk {self.source_type.value}:{self.source_id} chunk={self.chunk_index}>"
