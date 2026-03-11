"""
YouTube AI services — transcript fetching, summarisation, Q&A.

Uses youtube-transcript-api to pull the auto-generated / manual transcript
and then calls the local Ollama LLM for both summary and Q&A.
"""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncGenerator

from app.ai import ollama_client

logger = logging.getLogger(__name__)


# ── YouTube helpers ───────────────────────────────────────────────────

def extract_video_id(url: str) -> str | None:
    """Extract the YouTube video ID from any common YouTube URL format."""
    patterns = [
        r"(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})",
        r"^([A-Za-z0-9_-]{11})$",  # bare video ID
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def is_youtube_url(url: str) -> bool:
    return bool(extract_video_id(url))


def fetch_transcript(video_id: str, max_chars: int = 12_000) -> str:
    """
    Return the transcript text for a YouTube video.
    Tries English first, then falls back to whatever language is available.
    Raises ValueError if no transcript is found.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound

        try:
            entries = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        except NoTranscriptFound:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            transcript = transcript_list.find_generated_transcript(
                [t.language_code for t in transcript_list]
            )
            entries = transcript.fetch()

        text = " ".join(e["text"] for e in entries)
        # Trim to max_chars to avoid overwhelming the LLM context
        return text[:max_chars]
    except Exception as exc:
        logger.warning("Transcript fetch failed for %s: %s", video_id, exc)
        raise ValueError(f"Could not fetch transcript: {exc}") from exc


# ── Summarisation ─────────────────────────────────────────────────────

async def summarise_video(transcript: str) -> str:
    """Generate a concise summary of the video transcript (non-streaming)."""
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert at summarising educational video content. "
                "Write concise, well-structured markdown summaries."
            ),
        },
        {
            "role": "user",
            "content": (
                f"TRANSCRIPT:\n{transcript}\n\n"
                "Write a concise summary (3–5 paragraphs) of this lecture. "
                "Highlight key concepts, main takeaways, and important details. "
                "Use markdown formatting with headers and bullet points."
            ),
        },
    ]
    result = await ollama_client.chat(messages=messages, stream=False)
    return result  # type: ignore[return-value]


# ── Q&A streaming ─────────────────────────────────────────────────────

async def answer_youtube_question(
    question: str,
    transcript: str,
    history: list[dict[str, str]] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream an answer to a question about the video using the transcript as context.
    Yields raw text chunks.
    """
    system = (
        "You are a helpful tutor answering questions about a YouTube lecture video. "
        "Answer using ONLY the transcript provided below. "
        "If the answer cannot be found in the transcript, say so clearly. "
        "Be concise, clear, and supportive. Use markdown when helpful.\n\n"
        f"VIDEO TRANSCRIPT:\n{transcript}"
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    if history:
        messages.extend(history[-6:])  # last 3 turns
    messages.append({"role": "user", "content": question})

    stream_gen = await ollama_client.chat(messages=messages, stream=True)
    async for chunk in stream_gen:  # type: ignore[union-attr]
        yield chunk
