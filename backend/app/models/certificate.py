from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base
from app.models.enums import CertificateStatus
from app.models.mixins import TimestampMixin, str_enum


class Certificate(TimestampMixin, Base):
    __tablename__ = "certificates"
    __table_args__ = (Index("ix_certificates_org_status", "organization_id", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    certificate_number: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"),
                                                 nullable=False, index=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("certificate_templates.id", ondelete="SET NULL"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("certificate_categories.id", ondelete="SET NULL"))
    recipient_name: Mapped[str] = mapped_column(String(200), nullable=False)
    recipient_email: Mapped[str | None] = mapped_column(String(255), index=True)
    recipient_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    course_or_role: Mapped[str | None] = mapped_column(String(250))
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    extra_fields: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[CertificateStatus] = mapped_column(
        str_enum(CertificateStatus, "certificate_status"), default=CertificateStatus.ACTIVE, nullable=False)
    supersedes_id: Mapped[int | None] = mapped_column(ForeignKey("certificates.id", ondelete="SET NULL"))
    correction_request_id: Mapped[int | None] = mapped_column(
        ForeignKey("correction_requests.id", ondelete="SET NULL", use_alter=True))
    issued_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    pdf_path: Mapped[str | None] = mapped_column(String(500))
    pdf_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    data_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revocation_reason: Mapped[str | None] = mapped_column(Text)

    organization = relationship("Organization")
    template = relationship("CertificateTemplate")
    category = relationship("CertificateCategory")
    supersedes = relationship("Certificate", remote_side=[id], foreign_keys=[supersedes_id])
