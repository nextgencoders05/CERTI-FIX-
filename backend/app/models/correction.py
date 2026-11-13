from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.enums import ApprovalDecision, CorrectionStatus
from app.models.mixins import TimestampMixin, str_enum, utcnow


class CorrectionRequest(TimestampMixin, Base):
    __tablename__ = "correction_requests"
    __table_args__ = (Index("ix_correction_requests_org_status", "organization_id", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    document_id: Mapped[int] = mapped_column(ForeignKey("uploaded_documents.id", ondelete="RESTRICT"),
                                             nullable=False, index=True)
    original_certificate_id: Mapped[int | None] = mapped_column(ForeignKey("certificates.id", ondelete="SET NULL"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("certificate_categories.id", ondelete="SET NULL"))
    original_fields: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    requested_fields: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[CorrectionStatus] = mapped_column(
        str_enum(CorrectionStatus, "correction_status"), default=CorrectionStatus.SUBMITTED, nullable=False)
    corrected_certificate_id: Mapped[int | None] = mapped_column(
        ForeignKey("certificates.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    requester = relationship("User", foreign_keys=[requester_id])
    organization = relationship("Organization")
    document = relationship("UploadedDocument")
    original_certificate = relationship("Certificate", foreign_keys=[original_certificate_id])
    corrected_certificate = relationship("Certificate", foreign_keys=[corrected_certificate_id])
    category = relationship("CertificateCategory")
    approvals = relationship("ApprovalRecord", back_populates="correction_request",
                             order_by="ApprovalRecord.id", cascade="all, delete-orphan")


class ApprovalRecord(Base):
    """Append-only history of each review decision on a correction request."""
    __tablename__ = "approval_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    correction_request_id: Mapped[int] = mapped_column(
        ForeignKey("correction_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    decision: Mapped[ApprovalDecision] = mapped_column(str_enum(ApprovalDecision, "approval_decision"),
                                                       nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    correction_request = relationship("CorrectionRequest", back_populates="approvals")
    reviewer = relationship("User")
