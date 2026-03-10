"""
Quizzes API router.

POST   /api/quizzes/generate
GET    /api/quizzes/{id}
PUT    /api/quizzes/{id}
PUT    /api/quizzes/{id}/publish
GET    /api/quizzes/course/{course_id}
POST   /api/quizzes/{id}/attempts
GET    /api/quizzes/{id}/attempts/{aid}/next
POST   /api/quizzes/{id}/attempts/{aid}/answer
GET    /api/quizzes/{id}/attempts/{aid}/result
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_student, require_teacher
from app.models.quiz import (
    BloomLevel, GeneratedFrom, Question, QuestionResponse as QResponse,
    QuestionType, Quiz, QuizAttempt,
)
from app.models.user import User
from app.schemas.quiz import (
    AnswerRequest, AnswerResponse, AttemptCreateResponse, AttemptResultResponse,
    QuestionResponseDetail, QuestionStudentView, QuestionUpdateRequest,
    QuizGenerateRequest, QuizGenerateResponse, QuizListItem, QuizResponse,
    QuizUpdateRequest,
)
from app.services import adaptive_service
from app.tasks.quiz_generation import generate_quiz

router = APIRouter()


# ── Generate Quiz ─────────────────────────────────────────────────────


@router.post("/generate", response_model=QuizGenerateResponse)
async def generate_quiz_endpoint(
    body: QuizGenerateRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> QuizGenerateResponse:
    """Trigger AI quiz generation from lecture/material content."""
    quiz = Quiz(
        course_id=uuid.UUID(body.course_id),
        module_id=uuid.UUID(body.module_id) if body.module_id else None,
        title=body.title or f"AI Quiz — {body.source_type.title()}",
        generated_from=GeneratedFrom(body.source_type),
        source_id=uuid.UUID(body.source_id),
        is_adaptive=body.is_adaptive,
        is_published=False,
        created_by=teacher.id,
    )
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)

    # Fire Celery task
    generate_quiz.delay(
        str(quiz.id),
        body.source_type,
        body.source_id,
        body.num_questions,
        body.bloom_levels,
    )

    return QuizGenerateResponse(quiz_id=str(quiz.id), status="generating")


# ── CRUD ──────────────────────────────────────────────────────────────


@router.get("/course/{course_id}", response_model=list[QuizListItem])
async def list_quizzes(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[QuizListItem]:
    """List all quizzes for a course."""
    query = select(Quiz).where(Quiz.course_id == course_id)
    # Students only see published quizzes
    if current_user.role.value == "student":
        query = query.where(Quiz.is_published.is_(True))
    query = query.order_by(Quiz.created_at.desc())

    result = await db.execute(query)
    quizzes = result.scalars().all()

    items = []
    for q in quizzes:
        count_result = await db.execute(
            select(func.count()).where(Question.quiz_id == q.id)
        )
        count = count_result.scalar() or 0
        items.append(
            QuizListItem(
                id=str(q.id),
                course_id=str(q.course_id),
                title=q.title,
                generated_from=q.generated_from.value,
                is_adaptive=q.is_adaptive,
                is_published=q.is_published,
                question_count=count,
                created_at=q.created_at,
            )
        )
    return items


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(
    quiz_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuizResponse:
    """Get quiz with all questions."""
    quiz = await db.get(Quiz, quiz_id, options=[selectinload(Quiz.questions)])
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    return QuizResponse(
        id=str(quiz.id),
        course_id=str(quiz.course_id),
        module_id=str(quiz.module_id) if quiz.module_id else None,
        title=quiz.title,
        generated_from=quiz.generated_from.value,
        is_adaptive=quiz.is_adaptive,
        is_published=quiz.is_published,
        created_by=str(quiz.created_by),
        created_at=quiz.created_at,
        questions=[
            _question_to_response(q) for q in quiz.questions
        ],
    )


@router.put("/{quiz_id}", response_model=QuizResponse)
async def update_quiz(
    quiz_id: UUID,
    body: QuizUpdateRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> QuizResponse:
    """Update quiz metadata."""
    quiz = await db.get(Quiz, quiz_id, options=[selectinload(Quiz.questions)])
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    if body.title is not None:
        quiz.title = body.title
    if body.is_published is not None:
        quiz.is_published = body.is_published

    await db.commit()
    await db.refresh(quiz)

    return QuizResponse(
        id=str(quiz.id),
        course_id=str(quiz.course_id),
        module_id=str(quiz.module_id) if quiz.module_id else None,
        title=quiz.title,
        generated_from=quiz.generated_from.value,
        is_adaptive=quiz.is_adaptive,
        is_published=quiz.is_published,
        created_by=str(quiz.created_by),
        created_at=quiz.created_at,
        questions=[_question_to_response(q) for q in quiz.questions],
    )


@router.put("/{quiz_id}/publish")
async def publish_quiz(
    quiz_id: UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> dict:
    """Publish a quiz to students."""
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz.is_published = True
    await db.commit()
    return {"status": "published", "quiz_id": str(quiz.id)}


@router.put("/questions/{question_id}")
async def update_question(
    question_id: UUID,
    body: QuestionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> dict:
    """Update a single question (teacher edits before publishing)."""
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(question, field, value)

    await db.commit()
    return {"status": "updated", "question_id": str(question.id)}


# ── Attempts ──────────────────────────────────────────────────────────


@router.post("/{quiz_id}/attempts", response_model=AttemptCreateResponse)
async def create_attempt(
    quiz_id: UUID,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
) -> AttemptCreateResponse:
    """Start a new quiz attempt."""
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not quiz.is_published:
        raise HTTPException(status_code=400, detail="Quiz is not published yet")

    attempt = QuizAttempt(
        quiz_id=quiz_id,
        student_id=student.id,
        mastery_data={},
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    return AttemptCreateResponse(
        id=str(attempt.id),
        quiz_id=str(attempt.quiz_id),
        started_at=attempt.started_at,
    )


@router.get("/{quiz_id}/attempts/{attempt_id}/next", response_model=QuestionStudentView | None)
async def get_next_question(
    quiz_id: UUID,
    attempt_id: UUID,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
) -> QuestionStudentView | None:
    """Get the next question for an adaptive attempt."""
    attempt = await db.get(QuizAttempt, attempt_id)
    if not attempt or attempt.student_id != student.id:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # For non-adaptive quizzes, return questions in order
    quiz = await db.get(Quiz, quiz_id, options=[selectinload(Quiz.questions)])
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    if quiz.is_adaptive:
        question = await adaptive_service.next_question(attempt_id, db)
    else:
        # Get answered question IDs
        answered_result = await db.execute(
            select(QResponse.question_id).where(QResponse.attempt_id == attempt_id)
        )
        answered_ids = set(answered_result.scalars().all())
        remaining = [q for q in quiz.questions if q.id not in answered_ids]
        question = remaining[0] if remaining else None

    if not question:
        return None

    return QuestionStudentView(
        id=str(question.id),
        quiz_id=str(question.quiz_id),
        type=question.type.value,
        question_text=question.question_text,
        options=question.options,
        bloom_level=question.bloom_level.value,
        difficulty=question.difficulty,
        concept_tag=question.concept_tag,
    )


@router.post("/{quiz_id}/attempts/{attempt_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    quiz_id: UUID,
    attempt_id: UUID,
    body: AnswerRequest,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_student),
) -> AnswerResponse:
    """Submit an answer for a question in the attempt."""
    attempt = await db.get(QuizAttempt, attempt_id)
    if not attempt or attempt.student_id != student.id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.completed_at:
        raise HTTPException(status_code=400, detail="Attempt already completed")

    question = await db.get(Question, uuid.UUID(body.question_id))
    if not question or str(question.quiz_id) != str(quiz_id):
        raise HTTPException(status_code=404, detail="Question not found")

    # Check correctness
    is_correct = body.student_answer.strip().lower() == question.correct_answer.strip().lower()

    # Create response record
    response = QResponse(
        attempt_id=attempt_id,
        question_id=question.id,
        student_answer=body.student_answer,
        is_correct=is_correct,
        time_taken_seconds=body.time_taken_seconds,
    )
    db.add(response)
    await db.commit()

    # Update mastery
    mastery = await adaptive_service.update_mastery(
        attempt_id, question.id, is_correct, db
    )

    # Check if quiz is complete
    total_result = await db.execute(
        select(func.count()).where(Question.quiz_id == quiz_id)
    )
    total_questions = total_result.scalar() or 0

    answered_result = await db.execute(
        select(func.count()).where(QResponse.attempt_id == attempt_id)
    )
    answered_count = answered_result.scalar() or 0

    if answered_count >= total_questions:
        # Calculate final score
        correct_result = await db.execute(
            select(func.count()).where(
                QResponse.attempt_id == attempt_id,
                QResponse.is_correct.is_(True),
            )
        )
        correct_count = correct_result.scalar() or 0
        attempt.score = round(correct_count / total_questions * 100, 1) if total_questions > 0 else 0
        attempt.completed_at = datetime.now(timezone.utc)
        await db.commit()

    return AnswerResponse(
        is_correct=is_correct,
        correct_answer=question.correct_answer,
        explanation=question.explanation,
        mastery_update=mastery if mastery else None,
    )


@router.get("/{quiz_id}/attempts/{attempt_id}/result", response_model=AttemptResultResponse)
async def get_attempt_result(
    quiz_id: UUID,
    attempt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AttemptResultResponse:
    """Get the result of a completed quiz attempt."""
    attempt = await db.get(
        QuizAttempt, attempt_id,
        options=[selectinload(QuizAttempt.responses).selectinload(QResponse.question)],
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    correct_count = sum(1 for r in attempt.responses if r.is_correct)

    response_details = []
    for r in attempt.responses:
        q = r.question
        response_details.append(
            QuestionResponseDetail(
                question_id=str(r.question_id),
                question_text=q.question_text if q else "",
                question_type=q.type.value if q else "",
                student_answer=r.student_answer,
                correct_answer=q.correct_answer if q else "",
                is_correct=r.is_correct,
                explanation=q.explanation if q else "",
                concept_tag=q.concept_tag if q else "",
            )
        )

    return AttemptResultResponse(
        id=str(attempt.id),
        quiz_id=str(attempt.quiz_id),
        score=attempt.score,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        mastery_data=attempt.mastery_data,
        total_questions=len(attempt.responses),
        correct_count=correct_count,
        responses=response_details,
    )


# ── Helpers ───────────────────────────────────────────────────────────

def _question_to_response(q: Question) -> dict:
    from app.schemas.quiz import QuestionResponse as QR
    return QR(
        id=str(q.id),
        quiz_id=str(q.quiz_id),
        type=q.type.value,
        question_text=q.question_text,
        options=q.options,
        correct_answer=q.correct_answer,
        explanation=q.explanation,
        bloom_level=q.bloom_level.value,
        difficulty=q.difficulty,
        concept_tag=q.concept_tag,
    ).model_dump()
