"""Application configuration loaded from environment variables / .env."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "CertiFix AI"
    ENVIRONMENT: str = "development"  # development | test | production
    API_PREFIX: str = "/api"

    DATABASE_URL: str = "postgresql+psycopg2://certifix:certifix@localhost:5432/certifix"

    JWT_SECRET_KEY: str = INSECURE_DEFAULT_SECRET
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Private storage root: never mounted as a static/public directory.
    STORAGE_DIR: str = "storage"
    MAX_UPLOAD_MB: int = 10
    MAX_PDF_PAGES: int = 10
    UPLOAD_RETENTION_DAYS: int = 180

    CORS_ORIGINS: str = "http://localhost:5173"
    PUBLIC_VERIFY_BASE_URL: str = "http://localhost:5173/verify"

    TESSERACT_CMD: str | None = None
    OCR_LANG: str = "eng"

    RATE_LIMIT_PER_MINUTE: int = 300
    AUTH_RATE_LIMIT_PER_MINUTE: int = 20

    # Optional: path to a built frontend (dist/) to serve as SPA from the API container.
    FRONTEND_DIST: str | None = None

    @field_validator("TESSERACT_CMD", "FRONTEND_DIST", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        return v or None

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def storage_path(self) -> Path:
        return Path(self.STORAGE_DIR).resolve()

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    def validate_for_runtime(self) -> None:
        if self.ENVIRONMENT == "production" and (
            self.JWT_SECRET_KEY == INSECURE_DEFAULT_SECRET or len(self.JWT_SECRET_KEY) < 32
        ):
            raise RuntimeError("JWT_SECRET_KEY must be set to a strong secret (>=32 chars) in production.")


@lru_cache
def get_settings() -> Settings:
    return Settings()
