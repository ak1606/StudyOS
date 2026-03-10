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


async def embed_query(query: str) -> list[float]:
    """Embed a user query using nomic-embed-text (768-dim)."""
    return await ollama_client.embed(query)


async def semantic_search(
    db: AsyncSession,
    query: str,
    course_id: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """
    Run a cosine-similarity search against content_chunks for a course.

    Returns the top_k most relevant chunks with their scores.
    """
    # 1. Embed the query text
    query_vec = await embed_query(query)
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
