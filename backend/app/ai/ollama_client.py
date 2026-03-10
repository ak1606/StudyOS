"""
Ollama LLM client — all AI calls go through this module.

• Chat completions  → ollama.chat()   with the configured OLLAMA_MODEL
• Embeddings        → ollama.embeddings() with nomic-embed-text (768-dim)
• JSON generation   → chat + strict system prompt + JSON parsing

NEVER import openai or anthropic anywhere in this project.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import ollama as _ollama
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────
EMBED_MODEL = "nomic-embed-text"  # always 768 dimensions
EMBED_DIMENSIONS = 768


# ── Chat ──────────────────────────────────────────────────────────────

async def chat(
    messages: list[dict[str, str]],
    stream: bool = False,
) -> str | AsyncGenerator[str, None]:
    """
    Send a chat completion request to the local Ollama server.

    Args:
        messages: OpenAI-style list of {"role": ..., "content": ...} dicts.
        stream:   If True, return an async generator yielding tokens.

    Returns:
        Full response text (stream=False) or async token generator (stream=True).
    """
    try:
        if stream:
            return _stream_chat(messages)

        response = _ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=messages,
        )
        return response["message"]["content"]
    except Exception as exc:
        logger.error("Ollama chat error: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable",
        ) from exc


async def _stream_chat(
    messages: list[dict[str, str]],
) -> AsyncGenerator[str, None]:
    """Yield tokens from a streaming Ollama chat response."""
    try:
        stream = _ollama.chat(
            model=settings.OLLAMA_MODEL,
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            token = chunk["message"]["content"]
            if token:
                yield token
    except Exception as exc:
        logger.error("Ollama streaming error: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable",
        ) from exc


# ── Embeddings ────────────────────────────────────────────────────────

async def embed(text: str) -> list[float]:
    """
    Generate a 768-dimension embedding vector using nomic-embed-text.

    Always uses nomic-embed-text — never the chat model.
    """
    try:
        response = _ollama.embeddings(
            model=EMBED_MODEL,
            prompt=text,
        )
        return response["embedding"]
    except Exception as exc:
        logger.error("Ollama embedding error: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable",
        ) from exc


# ── JSON generation ───────────────────────────────────────────────────

async def generate_json(prompt: str, retries: int = 1) -> dict[str, Any]:
    """
    Ask Ollama to return structured JSON and parse it.

    Strips accidental markdown fences and retries once with a stricter
    prompt if the first attempt produces invalid JSON.
    """
    system_msg = (
        "You are a JSON generator. Return ONLY valid JSON. "
        "No markdown. No explanation. No text outside the JSON object."
    )

    for attempt in range(1 + retries):
        try:
            response = _ollama.chat(
                model=settings.OLLAMA_MODEL,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": prompt},
                ],
            )
            raw: str = response["message"]["content"].strip()

            # Strip markdown code fences if the model wraps output
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            if raw.endswith("```"):
                raw = raw[: raw.rfind("```")]

            return json.loads(raw.strip())

        except json.JSONDecodeError:
            if attempt < retries:
                # Make the system prompt even stricter on retry
                system_msg = (
                    "You MUST respond with a single valid JSON object. "
                    "No markdown fences. No comments. No trailing commas. "
                    "Start with { and end with }."
                )
                logger.warning("JSON parse failed, retrying with stricter prompt…")
                continue
            logger.error("Ollama returned invalid JSON after retries: %s", raw)
            raise HTTPException(
                status_code=502,
                detail="AI returned invalid JSON",
            )
        except Exception as exc:
            logger.error("Ollama JSON generation error: %s", exc)
            raise HTTPException(
                status_code=503,
                detail="AI service unavailable",
            ) from exc

    # Unreachable, but keeps type-checkers happy
    raise HTTPException(status_code=502, detail="AI returned invalid JSON")
