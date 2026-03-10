import logging

from supabase import Client, create_client

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Singleton Supabase client ─────────────────────────────────────────
_client: Client | None = None


def _get_client() -> Client:
    """Return (and lazily create) the Supabase client singleton."""
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _client


# ── Public helpers ────────────────────────────────────────────────────

def upload_file(
    bucket: str,
    path: str,
    file_bytes: bytes,
    content_type: str,
) -> str:
    """
    Upload a file to Supabase Storage.

    Args:
        bucket:       Target bucket name (lectures | materials | avatars).
        path:         Object path inside the bucket, e.g. "{course_id}/{uuid}.mp4".
        file_bytes:   Raw file content.
        content_type: MIME type, e.g. "video/mp4".

    Returns:
        The storage path (same as *path*).  Store this in the database —
        never store the full URL.
    """
    client = _get_client()
    client.storage.from_(bucket).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type},
    )
    logger.info("Uploaded %s/%s (%s)", bucket, path, content_type)
    return path


def get_signed_url(
    bucket: str,
    path: str,
    expires_in: int = 3600,
) -> str:
    """
    Generate a short-lived signed URL for a private storage object.

    Args:
        bucket:     Bucket name.
        path:       Object path.
        expires_in: Seconds until the URL expires (default 1 hour).

    Returns:
        Signed URL string.
    """
    client = _get_client()
    response = client.storage.from_(bucket).create_signed_url(
        path=path,
        expires_in=expires_in,
    )
    return response["signedURL"]


def delete_file(bucket: str, path: str) -> None:
    """
    Delete a file from Supabase Storage.

    Args:
        bucket: Bucket name.
        path:   Object path.
    """
    client = _get_client()
    client.storage.from_(bucket).remove([path])
    logger.info("Deleted %s/%s", bucket, path)
