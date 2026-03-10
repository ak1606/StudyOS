"""
Upload API router.

POST /api/upload — multipart file upload to Supabase Storage.
"""

import uuid as _uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_teacher
from app.core.supabase_client import get_signed_url, upload_file
from app.models.lecture import Lecture, LectureStatus
from app.models.user import User
from app.schemas.lecture import UploadResponse

router = APIRouter()

# ── Allowed MIME types ────────────────────────────────────────────────
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-matroska"}
PDF_TYPES = {"application/pdf"}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

# ── Max sizes (bytes) ────────────────────────────────────────────────
MAX_VIDEO = 500 * 1024 * 1024   # 500 MB
MAX_PDF = 50 * 1024 * 1024      # 50 MB
MAX_IMAGE = 5 * 1024 * 1024     # 5 MB

# ── Type → bucket mapping ────────────────────────────────────────────
BUCKET_MAP = {
    "video": "lectures",
    "pdf": "materials",
    "image": "avatars",
}


@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
    type: str = Form(..., description="video | pdf | image"),
    course_id: str | None = Form(None, description="Required for video/pdf"),
    module_id: str | None = Form(None, description="Required for video"),
    title: str | None = Form(None, description="Lecture title (for video)"),
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_teacher),
) -> UploadResponse:
    """
    Upload a file to Supabase Storage.

    • type=video → bucket `lectures`, creates Lecture (status=pending),
      fires transcribe_lecture Celery task.
    • type=pdf   → bucket `materials`
    • type=image → bucket `avatars`
    """
    # ── Validate type param ───────────────────────────────────────────
    if type not in BUCKET_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="type must be 'video', 'pdf', or 'image'",
        )

    # ── Validate content type ─────────────────────────────────────────
    content_type = file.content_type or ""
    if type == "video" and content_type not in VIDEO_TYPES:
        raise HTTPException(400, f"Invalid video type: {content_type}")
    elif type == "pdf" and content_type not in PDF_TYPES:
        raise HTTPException(400, f"Invalid PDF type: {content_type}")
    elif type == "image" and content_type not in IMAGE_TYPES:
        raise HTTPException(400, f"Invalid image type: {content_type}")

    # ── Read bytes + validate size ────────────────────────────────────
    file_bytes = await file.read()
    size = len(file_bytes)

    if type == "video" and size > MAX_VIDEO:
        raise HTTPException(400, "Video exceeds 500 MB limit")
    elif type == "pdf" and size > MAX_PDF:
        raise HTTPException(400, "PDF exceeds 50 MB limit")
    elif type == "image" and size > MAX_IMAGE:
        raise HTTPException(400, "Image exceeds 5 MB limit")

    # ── Build storage path ────────────────────────────────────────────
    ext = (file.filename or "file").rsplit(".", 1)[-1] if file.filename else "bin"
    file_uuid = str(_uuid.uuid4())
    bucket = BUCKET_MAP[type]

    if type in ("video", "pdf") and course_id:
        path = f"{course_id}/{file_uuid}.{ext}"
    elif type == "image":
        path = f"{teacher.id}/{file_uuid}.{ext}"
    else:
        path = f"unassigned/{file_uuid}.{ext}"

    # ── Upload to Supabase ────────────────────────────────────────────
    upload_file(bucket, path, file_bytes, content_type)
    signed_url = get_signed_url(bucket, path)

    # ── If video: create Lecture + fire Celery task ───────────────────
    lecture_id = None
    if type == "video" and module_id:
        lecture = Lecture(
            module_id=_uuid.UUID(module_id),
            title=title or file.filename or "Untitled Lecture",
            video_url=path,
            status=LectureStatus.pending,
        )
        db.add(lecture)
        await db.commit()
        await db.refresh(lecture)
        lecture_id = lecture.id

        # Fire Celery task (import here to avoid circular imports at module level)
        from app.tasks.transcription import transcribe_lecture

        transcribe_lecture.delay(str(lecture.id))

    return UploadResponse(
        file_url=path,
        signed_url=signed_url,
        bucket=bucket,
        path=path,
        lecture_id=lecture_id,
    )
