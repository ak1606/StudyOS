"""
FastAPI application entry-point.

• CORS middleware (configurable origins)
• Lifespan: verifies Postgres connection on startup
• All API routers mounted under /api
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging

import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_engine

logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run startup / shutdown tasks."""
    # Startup: verify database connectivity
    try:
        async with async_engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("✅  Database connection verified")
    except Exception as exc:
        logger.error("❌  Database connection failed: %s", exc)
        raise

    yield  # application runs

    # Shutdown: dispose engine pool
    await async_engine.dispose()
    logger.info("🛑  Database engine disposed")


# ── App instance ──────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
)


# ── GZip compression (responses > 1 KB) ─────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── CORS ──────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request timing header (helps front-end perf monitoring) ──────────
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time"] = f"{(time.perf_counter() - start) * 1000:.1f}ms"
    return response


# ── Global exception handler (RFC 7807 style) ────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "type": "about:blank",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "An unexpected error occurred.",
        },
    )


# ── Routers ───────────────────────────────────────────────────────────

from app.api import auth, courses, lectures, materials, upload, search, chat, quizzes, analytics, notifications, youtube_lectures, admin

app.include_router(auth.router,              prefix="/api/auth",          tags=["Auth"])
app.include_router(courses.router,           prefix="/api/courses",       tags=["Courses"])
app.include_router(lectures.router,          prefix="/api/lectures",      tags=["Lectures"])
app.include_router(youtube_lectures.router,  prefix="/api/lectures",      tags=["YouTube Lectures"])
app.include_router(materials.router,         prefix="/api/materials",     tags=["Materials"])
app.include_router(upload.router,            prefix="/api/upload",        tags=["Upload"])
app.include_router(search.router,            prefix="/api",               tags=["Search"])
app.include_router(chat.router,              prefix="/api",               tags=["Chat"])
app.include_router(quizzes.router,           prefix="/api/quizzes",       tags=["Quizzes"])
app.include_router(analytics.router,         prefix="/api/analytics",     tags=["Analytics"])
app.include_router(notifications.router,     prefix="/api",               tags=["Notifications"])
app.include_router(admin.router,             prefix="/api/admin/db",      tags=["Admin DB"])


# ── Health check ──────────────────────────────────────────────────────

@app.get("/api/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
