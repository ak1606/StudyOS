"""
Celery task — generate embeddings for lecture transcripts / material PDFs.

Pipeline:
  1. Fetch source text (lecture transcript or PDF text via pypdf)
  2. Chunk into 400-word segments with 50-word overlap
  3. Embed each chunk via Ollama nomic-embed-text (768-dim)
  4. Bulk-insert ContentChunk rows with vectors

Triggered by:
  • transcribe_lecture task (after Whisper finishes)
  • Material upload for PDFs
"""

import logging
import tempfile
import uuid

import httpx
import ollama as _ollama
from pypdf import PdfReader

from app.core.celery_app import celery_app
from app.core.database import SyncSessionLocal
from app.core.supabase_client import get_signed_url
from app.models.content_chunk import ContentChunk, SourceType
from app.models.lecture import Lecture
from app.models.material import Material

logger = logging.getLogger(__name__)

EMBED_MODEL = "nomic-embed-text"
CHUNK_WORDS = 400  # words per chunk
CHUNK_OVERLAP = 50  # word overlap


# ── Chunking ──────────────────────────────────────────────────────────

def _chunk_text_by_words(text: str, size: int = CHUNK_WORDS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks by word count."""
    words = text.split()
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = start + size
        chunks.append(" ".join(words[start:end]))
        start = end - overlap
    return chunks


def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract plain text from PDF bytes using pypdf."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp.flush()
        reader = PdfReader(tmp.name)
        pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)


# ── Main task ─────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3, name="app.tasks.embeddings.generate_embeddings")
def generate_embeddings(self, source_type: str, source_id: str) -> None:  # type: ignore[no-untyped-def]
    """
    Generate and store embeddings for a given source.

    Args:
        source_type: 'lecture_transcript', 'lecture_summary', or 'material_pdf'
        source_id:   UUID of the source row
    """
    with SyncSessionLocal() as db:
        try:
            text = ""
            course_id: uuid.UUID | None = None
            st = SourceType(source_type)
            metadata: dict = {}

            if st == SourceType.lecture_transcript:
                lecture = db.get(Lecture, source_id)
                if not lecture or not lecture.transcript:
                    logger.warning("No transcript for lecture %s — skipping", source_id)
                    return
                text = lecture.transcript
                course_id = lecture.module.course_id if lecture.module else None
                metadata = {"lecture_title": lecture.title}

            elif st == SourceType.lecture_summary:
                lecture = db.get(Lecture, source_id)
                if not lecture or not lecture.summary:
                    logger.warning("No summary for lecture %s — skipping", source_id)
                    return
                text = lecture.summary
                course_id = lecture.module.course_id if lecture.module else None
                metadata = {"lecture_title": lecture.title, "type": "summary"}

            elif st == SourceType.material_pdf:
                material = db.get(Material, source_id)
                if not material or not material.file_url:
                    logger.warning("No file_url for material %s — skipping", source_id)
                    return
                course_id = material.module.course_id if material.module else None
                metadata = {"material_title": material.title}

                # Download PDF from Supabase
                signed = get_signed_url("materials", material.file_url)
                resp = httpx.get(signed, timeout=120)
                resp.raise_for_status()
                text = _extract_pdf_text(resp.content)

            else:
                logger.warning("Unknown source_type: %s", source_type)
                return

            if not text.strip() or not course_id:
                logger.warning("Empty text or no course_id for %s/%s", source_type, source_id)
                return

            # ── Delete old chunks for this source ─────────────────────
            db.query(ContentChunk).filter(
                ContentChunk.source_type == st,
                ContentChunk.source_id == uuid.UUID(source_id),
            ).delete()
            db.flush()

            # ── Chunk + embed ─────────────────────────────────────────
            chunks = _chunk_text_by_words(text)
            logger.info(
                "Generating %d embeddings for %s/%s",
                len(chunks), source_type, source_id,
            )

            rows: list[ContentChunk] = []
            for idx, chunk in enumerate(chunks):
                response = _ollama.embeddings(model=EMBED_MODEL, prompt=chunk)
                embedding = response["embedding"]

                rows.append(ContentChunk(
                    course_id=course_id,
                    source_type=st,
                    source_id=uuid.UUID(source_id),
                    chunk_index=idx,
                    content=chunk,
                    embedding=embedding,
                    metadata_={**metadata, "chunk_index": idx},
                ))

            db.add_all(rows)
            db.commit()
            logger.info(
                "Stored %d chunks for %s/%s",
                len(rows), source_type, source_id,
            )

        except Exception as exc:
            db.rollback()
            logger.error(
                "Embedding generation failed for %s/%s: %s",
                source_type, source_id, exc,
            )
            raise self.retry(exc=exc, countdown=60)
