from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def str_enum(enum_cls, name: str):
    """Portable enum column: VARCHAR + CHECK constraint (works on PostgreSQL and SQLite)."""
    return Enum(enum_cls, name=name, native_enum=False, values_callable=lambda e: [m.value for m in e],
                validate_strings=True, length=32, create_constraint=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow,
                                                 nullable=False)
