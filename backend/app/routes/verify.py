"""Public certificate verification (by ID / QR code, or by uploading the issued PDF)."""
import hashlib

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import (Certificate, CertificateStatus, OrganizationStatus, VerificationRecord,
                        VerificationResult)
from app.schemas.certificate import VerificationOut
from app.services import storage
from app.services.file_validation import read_limited

router = APIRouter(prefix="/verify", tags=["Verification"])


def _record(db: Session, request: Request, query: str, method: str, result: VerificationResult,
            cert: Certificate | None) -> None:
    ip = request.client.host if request.client else ""
    db.add(VerificationRecord(
        certificate_id=cert.id if cert else None, query=query[:100], method=method, result=result,
        ip_hash=hashlib.sha256(ip.encode()).hexdigest() if ip else None,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
    ))
    db.commit()


def _build(db: Session, cert: Certificate | None) -> tuple[VerificationOut, VerificationResult]:
    if cert is None:
        return VerificationOut(result="not_found", message="No certificate with this ID or file was issued through "
                                                           "CertiFix AI."), VerificationResult.NOT_FOUND
    superseded_by = db.scalar(select(Certificate.certificate_number).where(Certificate.supersedes_id == cert.id))
    result = {
        CertificateStatus.ACTIVE: VerificationResult.VALID,
        CertificateStatus.REVOKED: VerificationResult.REVOKED,
        CertificateStatus.SUPERSEDED: VerificationResult.SUPERSEDED,
    }[cert.status]
    messages = {
        VerificationResult.VALID: f"This certificate is valid and was issued by {cert.organization.name}.",
        VerificationResult.REVOKED: "This certificate has been revoked by its issuer and is no longer valid.",
        VerificationResult.SUPERSEDED: f"This certificate was replaced by a corrected certificate "
                                       f"({superseded_by}) and is no longer valid." if superseded_by else
                                       "This certificate was replaced by a corrected certificate.",
    }
    out = VerificationOut(
        result=result.value, certificate_number=cert.certificate_number, recipient_name=cert.recipient_name,
        title=cert.title, course_or_role=cert.course_or_role, organization_name=cert.organization.name,
        organization_verified=cert.organization.status == OrganizationStatus.VERIFIED,
        category=cert.category.name if cert.category else None, issue_date=cert.issue_date,
        status=cert.status.value, revoked_at=cert.revoked_at,
        revocation_reason=cert.revocation_reason if cert.status == CertificateStatus.REVOKED else None,
        superseded_by=superseded_by, supersedes=cert.supersedes.certificate_number if cert.supersedes else None,
        is_corrected_reissue=cert.supersedes_id is not None or cert.correction_request_id is not None,
        message=messages[result],
    )
    return out, result


@router.get("/{certificate_number}", response_model=VerificationOut)
def verify_by_number(certificate_number: str, request: Request, db: Session = Depends(get_db)):
    number = certificate_number.strip().upper()[:40]
    cert = db.scalar(select(Certificate).where(func.upper(Certificate.certificate_number) == number))
    out, result = _build(db, cert)
    _record(db, request, number, "number", result, cert)
    return out


@router.post("/file", response_model=VerificationOut)
async def verify_by_file(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Checks whether an uploaded PDF is byte-for-byte identical to a PDF issued on the platform.

    The file is hashed in memory and never stored.
    """
    data = await read_limited(file, 10 * 1024 * 1024)
    digest = storage.sha256_hex(data)
    cert = db.scalar(select(Certificate).where(Certificate.pdf_sha256 == digest)) if data else None
    out, result = _build(db, cert)
    if cert is None:
        out.message = ("This file does not match any certificate PDF issued through CertiFix AI. It may have been "
                       "modified, or it was not issued on this platform. Try verifying by certificate ID instead.")
    _record(db, request, digest, "file", result, cert)
    return out
