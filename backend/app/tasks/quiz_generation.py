"""
Celery task — AI Quiz Generation.

Uses ContentChunk rows + Ollama to generate quiz questions.
"""

import json
import logging
import uuid

import ollama as _ollama

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import SyncSessionLocal
from app.models.content_chunk import ContentChunk, SourceType
from app.models.quiz import (
    BloomLevel, GeneratedFrom, Question, QuestionType, Quiz,
)

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.tasks.quiz_generation.generate_quiz")
def generate_quiz(
    self,
    quiz_id: str,
    source_type: str,
    source_id: str,
    num_questions: int = 10,
    bloom_levels: list[str] | None = None,
) -> dict:
    """
    Generate quiz questions from content chunks using Ollama.

    1. Fetch ContentChunk rows for the given source.
    2. Build a prompt asking for structured JSON questions.
    3. Parse and validate each item, bulk-insert Question rows.
    """
    if bloom_levels is None:
        bloom_levels = ["remember", "understand", "apply"]

    logger.info("Generating quiz %s from %s:%s (%d questions)", quiz_id, source_type, source_id, num_questions)

    with SyncSessionLocal() as db:
        try:
            # Map source_type string to SourceType enum values for lookup
            source_type_map = {
                "lecture": [SourceType.lecture_transcript, SourceType.lecture_summary],
                "material": [SourceType.material_pdf],
            }
            chunk_types = source_type_map.get(source_type, [SourceType.lecture_transcript])

            # Fetch chunks for the source
            chunks = (
                db.query(ContentChunk)
                .filter(
                    ContentChunk.source_id == uuid.UUID(source_id),
                    ContentChunk.source_type.in_(chunk_types),
                )
                .order_by(ContentChunk.chunk_index)
                .all()
            )

            if not chunks:
                logger.warning("No content chunks found for source %s:%s", source_type, source_id)
                # Still generate quiz but with generic content
                content_text = "No specific content available. Generate general knowledge questions."
            else:
                # Combine chunks up to ~2000 words
                combined = []
                word_count = 0
                for chunk in chunks:
                    words = chunk.content.split()
                    if word_count + len(words) > 2000:
                        remaining = 2000 - word_count
                        combined.append(" ".join(words[:remaining]))
                        break
                    combined.append(chunk.content)
                    word_count += len(words)
                content_text = "\n\n".join(combined)

            # Build the generation prompt
            bloom_str = ", ".join(bloom_levels)
            prompt = f"""Generate exactly {num_questions} quiz questions from the content below.

Mix question types: MCQ (4 options), true/false, short_answer.
Target Bloom taxonomy levels: {bloom_str}.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing text.
Each item must have these exact keys:
{{"type": "mcq"|"true_false"|"short_answer",
 "question_text": "...",
 "options": ["A","B","C","D"] or null for non-MCQ,
 "correct_answer": "...",
 "explanation": "brief explanation",
 "bloom_level": "remember"|"understand"|"apply"|"analyze",
 "difficulty": 1-5,
 "concept_tag": "short concept label"}}

CONTENT:
{content_text}"""

            # Call Ollama
            response = _ollama.chat(
                model=settings.OLLAMA_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a quiz generator. Return ONLY valid JSON arrays. "
                            "No markdown. No explanation outside the JSON."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )

            raw = response["message"]["content"].strip()

            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            if raw.endswith("```"):
                raw = raw[: raw.rfind("```")]

            questions_data = json.loads(raw.strip())

            if not isinstance(questions_data, list):
                questions_data = [questions_data]

            # Validate and insert questions
            valid_types = {t.value for t in QuestionType}
            valid_blooms = {b.value for b in BloomLevel}
            inserted = 0

            for item in questions_data[:num_questions]:
                try:
                    q_type = item.get("type", "mcq")
                    if q_type not in valid_types:
                        q_type = "mcq"

                    bloom = item.get("bloom_level", "remember")
                    if bloom not in valid_blooms:
                        bloom = "remember"

                    difficulty = int(item.get("difficulty", 3))
                    difficulty = max(1, min(5, difficulty))

                    options = item.get("options")
                    if q_type == "mcq" and not options:
                        continue  # Skip invalid MCQ without options

                    question = Question(
                        quiz_id=uuid.UUID(quiz_id),
                        type=QuestionType(q_type),
                        question_text=str(item.get("question_text", "")),
                        options=options,
                        correct_answer=str(item.get("correct_answer", "")),
                        explanation=str(item.get("explanation", "")),
                        bloom_level=BloomLevel(bloom),
                        difficulty=difficulty,
                        concept_tag=str(item.get("concept_tag", "general"))[:100],
                    )
                    db.add(question)
                    inserted += 1
                except Exception as e:
                    logger.warning("Skipping invalid question item: %s", e)
                    continue

            db.commit()
            logger.info("Inserted %d questions for quiz %s", inserted, quiz_id)
            return {"quiz_id": quiz_id, "questions_generated": inserted}

        except json.JSONDecodeError as e:
            logger.error("Failed to parse Ollama JSON for quiz %s: %s", quiz_id, e)
            return {"quiz_id": quiz_id, "error": "Failed to parse AI response"}
        except Exception as e:
            logger.error("Quiz generation failed for %s: %s", quiz_id, e)
            db.rollback()
            return {"quiz_id": quiz_id, "error": str(e)}
