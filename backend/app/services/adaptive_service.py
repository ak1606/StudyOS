"""
Adaptive assessment service — selects next question based on performance.
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quiz import Question, QuestionResponse, QuizAttempt

logger = logging.getLogger(__name__)


async def next_question(
    attempt_id: UUID,
    db: AsyncSession,
) -> Question | None:
    """
    Select the next question for an adaptive quiz attempt.

    Logic:
    - If last answer was correct → pick harder question (difficulty + 1), same concept_tag
    - If last answer was incorrect → pick easier question (difficulty - 1), same concept_tag
    - Never repeat already-answered questions
    - Falls back to any unanswered question if no match for concept/difficulty
    """
    # Get the attempt with its quiz
    attempt = await db.get(QuizAttempt, attempt_id)
    if not attempt:
        return None

    # Get already-answered question IDs
    answered_result = await db.execute(
        select(QuestionResponse.question_id).where(
            QuestionResponse.attempt_id == attempt_id
        )
    )
    answered_ids = set(answered_result.scalars().all())

    # Get all questions for this quiz
    all_questions_result = await db.execute(
        select(Question).where(Question.quiz_id == attempt.quiz_id)
    )
    all_questions = list(all_questions_result.scalars().all())

    # Filter to unanswered
    unanswered = [q for q in all_questions if q.id not in answered_ids]
    if not unanswered:
        return None

    # If no previous answers, start with medium difficulty
    if not answered_ids:
        # Sort by difficulty ascending and pick a middle one
        unanswered.sort(key=lambda q: q.difficulty)
        mid = len(unanswered) // 2
        return unanswered[mid]

    # Get the last response
    last_response_result = await db.execute(
        select(QuestionResponse)
        .where(QuestionResponse.attempt_id == attempt_id)
        .order_by(QuestionResponse.created_at.desc())
        .limit(1)
    )
    last_response = last_response_result.scalar_one_or_none()

    if not last_response:
        return unanswered[0]

    # Get the last question's details
    last_question = await db.get(Question, last_response.question_id)
    if not last_question:
        return unanswered[0]

    target_difficulty = last_question.difficulty + (1 if last_response.is_correct else -1)
    target_difficulty = max(1, min(5, target_difficulty))
    target_concept = last_question.concept_tag

    # Try to find a question matching concept + target difficulty
    best = None
    best_diff = float("inf")

    for q in unanswered:
        if q.concept_tag == target_concept:
            diff = abs(q.difficulty - target_difficulty)
            if diff < best_diff:
                best = q
                best_diff = diff

    # If no match for concept, try any question close to target difficulty
    if best is None:
        for q in unanswered:
            diff = abs(q.difficulty - target_difficulty)
            if diff < best_diff:
                best = q
                best_diff = diff

    return best or unanswered[0]


async def update_mastery(
    attempt_id: UUID,
    question_id: UUID,
    is_correct: bool,
    db: AsyncSession,
) -> dict:
    """
    Update the attempt's mastery_data for the answered concept.

    mastery_data structure: { "concept_tag": { "correct": N, "total": N, "pct": float } }
    """
    attempt = await db.get(QuizAttempt, attempt_id)
    if not attempt:
        return {}

    question = await db.get(Question, question_id)
    if not question:
        return {}

    mastery = dict(attempt.mastery_data or {})
    concept = question.concept_tag

    if concept not in mastery:
        mastery[concept] = {"correct": 0, "total": 0, "pct": 0.0}

    mastery[concept]["total"] += 1
    if is_correct:
        mastery[concept]["correct"] += 1
    mastery[concept]["pct"] = round(
        mastery[concept]["correct"] / mastery[concept]["total"] * 100, 1
    )

    attempt.mastery_data = mastery
    await db.commit()
    await db.refresh(attempt)

    return mastery
