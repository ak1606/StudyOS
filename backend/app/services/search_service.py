"""
Semantic search service — embed a query and find nearest chunks.

Uses pgvector's cosine distance operator ( <=> ) with an IVFFLAT index.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import ollama_client

logger = logging.getLogger(__name__)


async def embed_query(query: str) -> list[float] | None:
    """Embed a user query. Returns None if embedding model is unavailable."""
    try:
        return await ollama_client.embed(query)
    except Exception as exc:
        logger.warning("Embedding unavailable, skipping semantic search: %s", exc)
        return None


async def semantic_search(
    db: AsyncSession,
    query: str,
    course_id: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """
    Run a cosine-similarity search against content_chunks for a course.
    Returns empty list (graceful degradation) if embedding model is unavailable.
    """
    # 1. Embed the query text
    query_vec = await embed_query(query)
    if query_vec is None:
        logger.warning("Skipping semantic search — embedding model unavailable")
        return []
    vec_literal = "[" + ",".join(str(v) for v in query_vec) + "]"

    # 2. Run the vector similarity query
    sql = text("""
        SELECT
            id,
            course_id,
            source_type,
            source_id,
            chunk_index,
            content,
            metadata AS metadata_,
            1 - (embedding <=> :vec::vector) AS score
        FROM content_chunks
        WHERE course_id = :course_id
        ORDER BY embedding <=> :vec::vector
        LIMIT :top_k
    """)

    result = await db.execute(
        sql,
        {"vec": vec_literal, "course_id": course_id, "top_k": top_k},
    )

    rows = result.mappings().all()

    return [
        {
            "chunk_id": str(row["id"]),
            "course_id": str(row["course_id"]),
            "source_type": row["source_type"],
            "source_id": str(row["source_id"]),
            "chunk_index": row["chunk_index"],
            "content": row["content"],
            "metadata": row["metadata_"],
            "score": round(float(row["score"]), 4),
        }
        for row in rows
    ]
