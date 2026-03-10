"""
Models package — import all models here so Alembic can see them.
"""

from app.models.base import Base  # noqa: F401
from app.models.user import User, UserRole  # noqa: F401
from app.models.course import Course, CourseModule  # noqa: F401
from app.models.lecture import Lecture, LectureStatus  # noqa: F401
from app.models.material import Material, MaterialType  # noqa: F401
from app.models.enrollment import Enrollment, EnrollmentStatus  # noqa: F401
from app.models.content_chunk import ContentChunk, SourceType  # noqa: F401
from app.models.chat import ChatSession, ChatMessage, MessageRole  # noqa: F401
from app.models.quiz import (  # noqa: F401
    Quiz, Question, QuizAttempt, QuestionResponse,
    GeneratedFrom, QuestionType, BloomLevel,
)
from app.models.analytics import (  # noqa: F401
    LectureView, EngagementScore, ClassInsight,
)
from app.models.notification import (  # noqa: F401
    Notification, Announcement, NotificationType,
)
