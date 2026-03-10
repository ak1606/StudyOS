"""
User ORM model.

Roles: admin, teacher, student, parent.
"""

import enum
import uuid

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    teacher = "teacher"
    student = "student"
    parent = "parent"


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", create_constraint=True),
        nullable=False,
        default=UserRole.student,
    )
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── Relationships (loaded lazily, defined as back-populates arrive) ──
    courses_teaching = relationship(
        "Course", back_populates="teacher", lazy="selectin"
    )
    enrollments = relationship(
        "Enrollment", back_populates="student", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} role={self.role.value}>"
