from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables / .env file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/lms"

    # Synchronous URL used inside Celery workers (asyncpg cannot be used
    # in the synchronous Celery context).
    @property
    def SYNC_DATABASE_URL(self) -> str:
        return self.DATABASE_URL.replace("+asyncpg", "")

    # ── Redis / Celery ────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Supabase Storage ──────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    # ── Ollama (local LLM) ────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # ── Whisper (local speech-to-text) ────────────────────────────────
    WHISPER_MODEL: str = "base"

    # ── JWT Auth ──────────────────────────────────────────────────────
    JWT_SECRET: str = "change-this-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── App ───────────────────────────────────────────────────────────
    APP_NAME: str = "AI-Enhanced LMS"
    DEBUG: bool = False


settings = Settings()
