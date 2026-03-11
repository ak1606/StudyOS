"""
AI Tutor service — RAG-powered course chatbot with streaming.

Flow:
  1. Embed the student's question
  2. Semantic search for top-5 relevant content chunks
  3. Build system prompt with course context
  4. Stream Ollama response token-by-token
  5. Save both user and assistant messages to DB
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import ollama_client
from app.core.config import settings
from app.models.chat import ChatMessage, ChatSession, MessageRole
from app.services.search_service import semantic_search

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a helpful course tutor. Answer using ONLY the course materials "
    "provided below. If the answer is not in the materials, say so clearly. "
    "Always state which lecture or material your answer comes from. "
    "Be concise, clear, and supportive."
)


async def get_or_create_session(
    db: AsyncSession,
    course_id: str,
    student_id: str,
    session_id: str | None = None,
) -> ChatSession:
    """Load an existing session or create a new one."""
    if session_id:
        session = await db.get(ChatSession, uuid.UUID(session_id))
        if session:
            return session

    session = ChatSession(
        course_id=uuid.UUID(course_id),
        student_id=uuid.UUID(student_id),
    )
    db.add(session)
    await db.flush()
    return session


async def get_session_history(
    db: AsyncSession,
    session_id: uuid.UUID,
    limit: int = 6,
) -> list[dict[str, str]]:
    """Fetch the last N messages from a session as OpenAI-style dicts."""
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    return [
        {"role": msg.role.value, "content": msg.content}
        for msg in messages
    ]


async def answer_question(
    question: str,
    course_id: str,
    student_id: str,
    session_id: str | None,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """
    RAG-powered streaming answer generator.

    Yields SSE-formatted lines:
      data: {"token": "..."}
      data: {"done": true, "sources": [...], "session_id": "..."}
    """
    import json

    # 1. Get or create chat session
    session = await get_or_create_session(db, course_id, student_id, session_id)

    # 2. Semantic search for relevant chunks
    chunks = await semantic_search(db, question, course_id, top_k=5)
    sources = [
        {
            "chunk_id": c["chunk_id"],
            "content": c["content"][:200],
            "source_type": c["source_type"],
            "score": c["score"],
        }
        for c in chunks
    ]

    # 3. Build context from chunks
    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        source_label = chunk.get("metadata", {}).get(
            "lecture_title",
            chunk.get("metadata", {}).get("material_title", "Unknown"),
        )
        context_parts.append(
            f"[Source {i}: {source_label}]\n{chunk['content']}"
        )
    context_text = "\n\n".join(context_parts)

    # 4. Build message list
    history = await get_session_history(db, session.id, limit=6)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {
            "role": "user",
            "content": (
                f"Course materials:\n{context_text}\n\nStudent question: {question}"
                if context_text
                else question
            ),
        },
    ]

    # 5. Save user message
    user_msg = ChatMessage(
        session_id=session.id,
        role=MessageRole.user,
        content=question,
    )
    db.add(user_msg)
    await db.flush()

    # 6. Stream response
    full_response = ""
    try:
        stream_gen = await ollama_client.chat(messages=messages, stream=True)
        async for token in stream_gen:
            full_response += token
            yield f"data: {json.dumps({'token': token})}\n\n"
    except Exception as exc:
        logger.error("Tutor streaming error: %s", exc)
        yield f"data: {json.dumps({'token': '[Error: AI service unavailable]'})}\n\n"

    # 7. Save assistant message
    assistant_msg = ChatMessage(
        session_id=session.id,
        role=MessageRole.assistant,
        content=full_response,
        sources=sources,
    )
    db.add(assistant_msg)
    await db.commit()

    # 8. Final event
    yield f"data: {json.dumps({'done': True, 'sources': sources, 'session_id': str(session.id)})}\n\n"
