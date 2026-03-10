"""
Chat API — AI tutor chatbot with SSE streaming + session history.

POST /api/courses/{course_id}/chat           → SSE stream
GET  /api/courses/{course_id}/chat/sessions  → list sessions
GET  /api/courses/{course_id}/chat/sessions/{session_id}  → session detail
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.chat import ChatMessage, ChatSession
from app.models.user import User
from app.schemas.chat import (
    ChatMessageResponse,
    ChatRequest,
    ChatSessionListItem,
    ChatSessionResponse,
)
from app.ai.tutor import answer_question

router = APIRouter()


# ── POST /courses/{course_id}/chat  (SSE stream) ─────────────────────

@router.post(
    "/courses/{course_id}/chat",
    summary="Ask the AI tutor a question (streaming SSE)",
)
async def chat_with_tutor(
    course_id: str,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Send a question to the AI tutor and receive a streaming SSE response.
    Each token is sent as `data: {"token": "..."}`.
    The final event is `data: {"done": true, "sources": [...], "session_id": "..."}`.
    """
    return StreamingResponse(
        answer_question(
            question=body.question,
            course_id=course_id,
            student_id=str(current_user.id),
            session_id=body.session_id,
            db=db,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── GET /courses/{course_id}/chat/sessions ────────────────────────────

@router.get(
    "/courses/{course_id}/chat/sessions",
    response_model=list[ChatSessionListItem],
    summary="List chat sessions for a course",
)
async def list_chat_sessions(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatSessionListItem]:
    """Return all chat sessions the current user has for this course."""
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(
            ChatSession.course_id == uuid.UUID(course_id),
            ChatSession.student_id == current_user.id,
        )
        .order_by(ChatSession.created_at.desc())
    )
    sessions = result.scalars().all()

    items: list[ChatSessionListItem] = []
    for s in sessions:
        last_msg = s.messages[-1] if s.messages else None
        items.append(
            ChatSessionListItem(
                id=str(s.id),
                course_id=str(s.course_id),
                created_at=s.created_at.isoformat(),
                message_count=len(s.messages),
                last_message_preview=(
                    last_msg.content[:100] if last_msg else None
                ),
            )
        )
    return items


# ── GET /courses/{course_id}/chat/sessions/{session_id} ──────────────

@router.get(
    "/courses/{course_id}/chat/sessions/{session_id}",
    response_model=ChatSessionResponse,
    summary="Get a chat session with all messages",
)
async def get_chat_session(
    course_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSessionResponse:
    """Return a full chat session including all messages."""
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(
            ChatSession.id == uuid.UUID(session_id),
            ChatSession.course_id == uuid.UUID(course_id),
            ChatSession.student_id == current_user.id,
        )
    )
    session = result.scalars().first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found",
        )

    return ChatSessionResponse(
        id=str(session.id),
        course_id=str(session.course_id),
        student_id=str(session.student_id),
        created_at=session.created_at.isoformat(),
        messages=[
            ChatMessageResponse(
                id=str(m.id),
                session_id=str(m.session_id),
                role=m.role.value,
                content=m.content,
                sources=m.sources,
                created_at=m.created_at.isoformat(),
            )
            for m in session.messages
        ],
    )
