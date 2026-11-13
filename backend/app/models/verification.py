from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base
from app.models.enums import VerificationResult
from app.models.mixins import str_enum, utcnow


class VerificationRecord(Base):
    __tablename__ = "verification_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    certificate_id: Mapped[int | None] = mapped_column(ForeignKey("certificates.id", ondelete="SET NULL"),
                                                       index=True)
    query: Mapped[str] = mapped_column(String(100), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="number")  # number | file
    result: Mapped[VerificationResult] = mapped_column(str_enum(VerificationResult, "verification_result"),
                                                       nullable=False)
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
