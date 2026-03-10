"""
Celery task — transcribe a lecture video using Whisper.

Pipeline:
  1. Set lecture.status = 'processing'
  2. Download video from Supabase via signed URL
  3. Whisper transcribes to text
  4. Ollama summarises into 3-5 bullet points
  5. Save transcript + summary, set status = 'ready'
  6. Chain → generate_embeddings task
  7. On failure → set status = 'failed'
"""

import logging
import tempfile

import httpx
import ollama as _ollama
import whisper

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SyncSessionLocal
from app.core.supabase_client import get_signed_url
from app.models.lecture import Lecture, LectureStatus

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, name="app.tasks.transcription.transcribe_lecture")
def transcribe_lecture(self, lecture_id: str) -> None:  # type: ignore[no-untyped-def]
    """
    Transcribe a lecture video and generate a summary.
    Runs synchronously inside a Celery worker.
    """
    with SyncSessionLocal() as db:
        lecture = db.get(Lecture, lecture_id)
        if not lecture:
            logger.error("Lecture %s not found", lecture_id)
            return

        lecture.status = LectureStatus.processing
        db.commit()

        tmp_path = None
        try:
            # ── 1. Download video from Supabase ───────────────────────
            signed_url = get_signed_url("lectures", lecture.video_url)
            logger.info("Downloading video for lecture %s", lecture_id)

            with tempfile.NamedTemporaryFile(
                suffix=".mp4", delete=False
            ) as tmp_file:
                tmp_path = tmp_file.name
                with httpx.stream("GET", signed_url, timeout=600) as resp:
                    resp.raise_for_status()
                    for chunk in resp.iter_bytes(chunk_size=8192):
                        tmp_file.write(chunk)

            # ── 2. Transcribe with Whisper ────────────────────────────
            logger.info("Transcribing lecture %s with Whisper (%s)", lecture_id, settings.WHISPER_MODEL)
            model = whisper.load_model(settings.WHISPER_MODEL)
            result = model.transcribe(tmp_path)
            transcript: str = result["text"]

            lecture.transcript = transcript
            logger.info("Transcription done for lecture %s (%d chars)", lecture_id, len(transcript))

            # ── 3. Summarise with Ollama ──────────────────────────────
            logger.info("Generating summary for lecture %s", lecture_id)
            summary_response = _ollama.chat(
                model=settings.OLLAMA_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful academic assistant. "
                            "Summarise the following lecture transcript into "
                            "3-5 concise bullet points. Return only the bullet points."
                        ),
                    },
                    {"role": "user", "content": transcript[:8000]},
                ],
            )
            lecture.summary = summary_response["message"]["content"]

            # ── 4. Mark ready ─────────────────────────────────────────
            lecture.status = LectureStatus.ready
            db.commit()
            logger.info("Lecture %s is now READY", lecture_id)

            # ── 5. Chain: generate embeddings ─────────────────────────
            from app.tasks.embeddings import generate_embeddings

            generate_embeddings.delay("lecture_transcript", lecture_id)
            generate_embeddings.delay("lecture_summary", lecture_id)

        except Exception as exc:
            lecture.status = LectureStatus.failed
            db.commit()
            logger.error("Transcription failed for %s: %s", lecture_id, exc)
            raise self.retry(exc=exc, countdown=60)

        finally:
            # Clean up temp file
            if tmp_path:
                import os

                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
