"""
Pydantic schemas for search and chat.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Search ────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    chunk_id: str
    course_id: str
    source_type: str
    source_id: str
    chunk_index: int
    content: str
    metadata: dict | None = None
    score: float


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


# ── Chat ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    session_id: str | None = None


class ChatSourceResponse(BaseModel):
    chunk_id: str
    content: str
    source_type: str
    score: float


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    sources: list[ChatSourceResponse] | None = None
    created_at: str


class ChatSessionResponse(BaseModel):
    id: str
    course_id: str
    student_id: str
    created_at: str
    messages: list[ChatMessageResponse] = []


class ChatSessionListItem(BaseModel):
    id: str
    course_id: str
    created_at: str
    message_count: int
    last_message_preview: str | None = None
