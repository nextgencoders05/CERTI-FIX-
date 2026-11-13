"""Issuing certificates: numbering, integrity hashing, PDF generation and storage."""
import json
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Certificate, CertificateStatus, CertificateTemplate, Organization, User
from app.services import storage
from app.services.identifiers import new_certificate_number
from app.services.pdf_generator import CertificateRenderData, generate_certificate_pdf


@dataclass
class IssueData:
    recipient_name: str
    title: str
    issue_date: date
    recipient_email: str | None = None
    recipient_user_id: int | None = None
    course_or_role: str | None = None
    description: str | None = None
    category_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    extra_fields: dict = field(default_factory=dict)


def verify_url(number: str) -> str:
    return f"{get_settings().PUBLIC_VERIFY_BASE_URL.rstrip('/')}/{number}"


def _unique_number(db: Session) -> str:
    for _ in range(10):
        number = new_certificate_number()
        if not db.scalar(select(func.count()).select_from(Certificate)
                         .where(Certificate.certificate_number == number)):
            return number
    raise RuntimeError("Could not allocate a unique certificate number")


def compute_data_hash(number: str, org_id: int, d: IssueData) -> str:
    canonical = json.dumps({
        "certificate_number": number,
        "organization_id": org_id,
        "recipient_name": d.recipient_name,
        "title": d.title,
        "course_or_role": d.course_or_role,
        "start_date": d.start_date.isoformat() if d.start_date else None,
        "end_date": d.end_date.isoformat() if d.end_date else None,
        "issue_date": d.issue_date.isoformat(),
        "extra_fields": d.extra_fields,
    }, sort_keys=True, separators=(",", ":"))
    return storage.sha256_hex(canonical.encode("utf-8"))


def _logo_bytes(org: Organization) -> bytes | None:
    if not org.logo_path:
        return None
    try:
        return storage.read_bytes(org.logo_path)
    except (OSError, ValueError):
        return None


def render_for(org: Organization, template: CertificateTemplate, number: str, d: IssueData,
               category_name: str | None, data_hash: str, supersedes_number: str | None = None,
               is_preview: bool = False) -> bytes:
    return generate_certificate_pdf(CertificateRenderData(
        certificate_number=number,
        organization_name=org.name,
        title_text=d.title or template.title_text,
        body_text=template.body_text,
        recipient_name=d.recipient_name,
        verify_url=verify_url(number),
        issue_date=d.issue_date,
        course_or_role=d.course_or_role,
        description=d.description,
        start_date=d.start_date,
        end_date=d.end_date,
        category=category_name,
        extra_fields=d.extra_fields,
        layout=template.layout or {},
        logo_bytes=_logo_bytes(org),
        supersedes_number=supersedes_number,
        data_hash=data_hash,
        is_preview=is_preview,
    ))


def issue_certificate(db: Session, *, org: Organization, template: CertificateTemplate, data: IssueData,
                      issuer: User, supersedes: Certificate | None = None,
                      correction_request_id: int | None = None) -> Certificate:
    """Create the certificate record and its authorized PDF. Caller commits."""
    number = _unique_number(db)
    data_hash = compute_data_hash(number, org.id, data)
    cert = Certificate(
        certificate_number=number,
        organization_id=org.id,
        template_id=template.id,
        category_id=data.category_id or template.category_id,
        recipient_name=data.recipient_name,
        recipient_email=(data.recipient_email or None),
        recipient_user_id=data.recipient_user_id,
        title=data.title,
        course_or_role=data.course_or_role,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        issue_date=data.issue_date,
        extra_fields=data.extra_fields or {},
        status=CertificateStatus.ACTIVE,
        supersedes_id=supersedes.id if supersedes else None,
        correction_request_id=correction_request_id,
        issued_by_id=issuer.id,
        data_sha256=data_hash,
    )
    db.add(cert)
    db.flush()
    db.refresh(cert)
    category_name = cert.category.name if cert.category else None
    pdf = render_for(org, template, number, data, category_name, data_hash,
                     supersedes_number=supersedes.certificate_number if supersedes else None)
    cert.pdf_path = storage.save_bytes("certificates", pdf, "pdf")
    cert.pdf_sha256 = storage.sha256_hex(pdf)

    if supersedes is not None:
        supersedes.status = CertificateStatus.SUPERSEDED
        supersedes.revoked_at = datetime.now(timezone.utc)
        supersedes.revocation_reason = f"Superseded by corrected certificate {number}"
    return cert
