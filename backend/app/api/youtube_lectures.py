"""
YouTube Lecture API — endpoints for YouTube-based lectures.

POST /api/lectures/youtube                    → create lecture from YouTube URL
GET  /api/lectures/{id}/youtube/transcript    → fetch / refresh transcript
GET  /api/lectures/{id}/youtube/summary       → AI-generated summary
POST /api/lectures/{id}/youtube/chat          → streaming Q&A (SSE)
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.youtube_ai import (
    answer_youtube_question,
    extract_video_id,
    fetch_transcript,
    is_youtube_url,
    summarise_video,
)
from app.core.database import get_db
from app.core.deps import get_current_user, require_teacher
from app.models.course import CourseModule
from app.models.lecture import Lecture, LectureStatus
from app.models.user import User
from app.schemas.lecture import LectureDetailResponse

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────

class YouTubeLectureCreate(BaseModel):
    module_id: UUID
    title: str
    description: str | None = None
    youtube_url: str


class YouTubeChatRequest(BaseModel):
    question: str
    history: list[dict] = []


# ── Helpers ───────────────────────────────────────────────────────────

async def _get_lecture_or_404(db: AsyncSession, lecture_id: UUID) -> Lecture:
    stmt = select(Lecture).where(Lecture.id == lecture_id)
    result = await db.execute(stmt)
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
    return lecture


def _require_youtube(lecture: Lecture) -> str:
    """Return video_url if it's a YouTube URL, else raise 400."""
    if not is_youtube_url(lecture.video_url):
        raise HTTPException(
            status_code=400,
            detail="This lecture is not a YouTube lecture",
        )
    return lecture.video_url


# ── POST /api/lectures/youtube ────────────────────────────────────────

@router.post(
    "/youtube",
    response_model=LectureDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_youtube_lecture(
    body: YouTubeLectureCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> LectureDetailResponse:
    """
    Add a YouTube lecture to a module. The YouTube URL is stored as video_url.
    The transcript is fetched immediately and stored.
    """
    if not is_youtube_url(body.youtube_url):
        raise HTTPException(status_code=400, detail="Not a valid YouTube URL")

    # Verify module ownership
    stmt = (
        select(CourseModule)
        .options(selectinload(CourseModule.course))
        .where(CourseModule.id == body.module_id)
    )
    result = await db.execute(stmt)
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    if module.course.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not your course")

    # Count existing lectures for order_index
    from sqlalchemy import func
    count_result = await db.execute(
        select(func.count()).where(Lecture.module_id == body.module_id)
    )
    order_index = count_result.scalar() or 0

    # Fetch transcript synchronously (runs in executor)
    transcript: str | None = None
    video_id = extract_video_id(body.youtube_url)
    if video_id:
        try:
            import asyncio
            transcript = await asyncio.get_event_loop().run_in_executor(
                None, fetch_transcript, video_id
            )
        except ValueError as exc:
            logger.warning("Transcript fetch failed: %s", exc)

    lecture = Lecture(
        module_id=body.module_id,
        title=body.title,
        description=body.description,
        video_url=body.youtube_url,  # store the YouTube URL directly
        transcript=transcript,
        status=LectureStatus.ready,
        order_index=order_index,
    )
    db.add(lecture)
    await db.commit()
    await db.refresh(lecture)
    return LectureDetailResponse.model_validate(lecture)


# ── GET /api/lectures/{id}/youtube/transcript ─────────────────────────

@router.get("/{lecture_id}/youtube/transcript")
async def get_youtube_transcript(
    lecture_id: UUID,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return (and optionally refresh) the stored YouTube transcript."""
    import asyncio

    lecture = await _get_lecture_or_404(db, lecture_id)
    url = _require_youtube(lecture)

    if lecture.transcript and not refresh:
        return {"transcript": lecture.transcript, "cached": True}

    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Cannot extract video ID")

    try:
        transcript = await asyncio.get_event_loop().run_in_executor(
            None, fetch_transcript, video_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    lecture.transcript = transcript
    await db.commit()
    return {"transcript": transcript, "cached": False}


# ── GET /api/lectures/{id}/youtube/summary ────────────────────────────

@router.get("/{lecture_id}/youtube/summary")
async def get_youtube_summary(
    lecture_id: UUID,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return (and optionally regenerate) the AI summary for a YouTube lecture."""
    import asyncio

    lecture = await _get_lecture_or_404(db, lecture_id)
    _require_youtube(lecture)

    # Return cached summary unless refresh requested
    if lecture.summary and not refresh:
        return {"summary": lecture.summary, "cached": True}

    # Make sure we have a transcript
    if not lecture.transcript:
        video_id = extract_video_id(lecture.video_url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Cannot extract video ID")
        try:
            transcript = await asyncio.get_event_loop().run_in_executor(
                None, fetch_transcript, video_id
            )
            lecture.transcript = transcript
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    summary = await summarise_video(lecture.transcript)
    lecture.summary = summary
    await db.commit()
    return {"summary": summary, "cached": False}


# ── POST /api/lectures/{id}/youtube/chat ──────────────────────────────

@router.post("/{lecture_id}/youtube/chat")
async def youtube_chat(
    lecture_id: UUID,
    body: YouTubeChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Stream an AI answer to a question about the YouTube lecture.
    SSE format: `data: {"token": "..."}` … `data: {"done": true}`.
    """
    import asyncio

    lecture = await _get_lecture_or_404(db, lecture_id)
    _require_youtube(lecture)

    # Ensure transcript exists
    if not lecture.transcript:
        video_id = extract_video_id(lecture.video_url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Cannot extract video ID")
        try:
            transcript = await asyncio.get_event_loop().run_in_executor(
                None, fetch_transcript, video_id
            )
            lecture.transcript = transcript
            await db.commit()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    transcript = lecture.transcript

    async def event_stream():
        try:
            async for token in answer_youtube_question(
                question=body.question,
                transcript=transcript,
                history=body.history,
            ):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as exc:
            logger.error("YouTube chat stream error: %s", exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
