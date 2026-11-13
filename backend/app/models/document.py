from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.enums import OCRStatus
from app.models.mixins import TimestampMixin, str_enum


class UploadedDocument(TimestampMixin, Base):
    """A certificate uploaded by a user. Stored privately and never modified."""
    __tablename__ = "uploaded_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ocr_status: Mapped[OCRStatus] = mapped_column(str_enum(OCRStatus, "ocr_status"), default=OCRStatus.PENDING,
                                                  nullable=False)
    ocr_method: Mapped[str | None] = mapped_column(String(30))
    ocr_text: Mapped[str | None] = mapped_column(Text)
    ocr_fields: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    ocr_confidence: Mapped[float | None] = mapped_column(Float)
    ocr_error: Mapped[str | None] = mapped_column(Text)
    delete_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
