"""
Search API — semantic search across course content chunks.

GET /api/courses/{course_id}/search?q=your+query&top_k=5
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.chat import SearchResponse
from app.services.search_service import semantic_search

router = APIRouter()


@router.get(
    "/courses/{course_id}/search",
    response_model=SearchResponse,
    summary="Semantic search over course content",
)
async def search_course(
    course_id: str,
    q: str = Query(..., min_length=1, max_length=500, description="Search query"),
    top_k: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    """Embed the query and return the top-k most relevant content chunks."""
    results = await semantic_search(db, q, course_id, top_k=top_k)
    return SearchResponse(query=q, results=results)
