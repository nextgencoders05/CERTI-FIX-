from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import (Certificate, CertificateCategory, CertificateStatus, CertificateTemplate, Organization,
                        User, UserRole)
from app.routes.utils import Pagination, file_response, like, paginate
from app.schemas.certificate import CertificateCreate, CertificateOut, RevokeRequest
from app.schemas.common import Page
from app.security.deps import get_current_user, get_verified_organization
from app.services import storage
from app.services.audit import log_action
from app.services.certificate_service import IssueData, issue_certificate
from app.services.notifications import notify

router = APIRouter(prefix="/certificates", tags=["Certificates"])


def can_view(user: User, cert: Certificate) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    if user.role == UserRole.ORGANIZATION:
        return user.organization_id == cert.organization_id
    return cert.recipient_user_id == user.id or (
        cert.recipient_email is not None and cert.recipient_email.lower() == user.email.lower())


@router.post("", response_model=CertificateOut, status_code=201)
def create_certificate(payload: CertificateCreate, request: Request,
                       org: Organization = Depends(get_verified_organization), db: Session = Depends(get_db)):
    issuer = db.get(User, request.state.user_id)
    tpl = db.get(CertificateTemplate, payload.template_id)
    if not tpl or tpl.organization_id != org.id or not tpl.is_active:
        raise HTTPException(status_code=400, detail="Invalid or inactive template")
    if payload.category_id is not None:
        cat = db.get(CertificateCategory, payload.category_id)
        if not cat or not cat.is_active:
            raise HTTPException(status_code=400, detail="Invalid category")
    recipient_user = None
    if payload.recipient_email:
        recipient_user = db.scalar(select(User).where(func.lower(User.email) == payload.recipient_email.lower(),
                                                      User.role == UserRole.USER))
    data = IssueData(
        recipient_name=payload.recipient_name.strip(),
        recipient_email=payload.recipient_email.lower() if payload.recipient_email else None,
        recipient_user_id=recipient_user.id if recipient_user else None,
        title=(payload.title or tpl.title_text).strip(),
        course_or_role=payload.course_or_role,
        description=payload.description,
        category_id=payload.category_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        issue_date=payload.issue_date or date.today(),
        extra_fields=payload.extra_fields,
    )
    cert = issue_certificate(db, org=org, template=tpl, data=data, issuer=issuer)
    log_action(db, "certificate.issued", issuer, "certificate", cert.id,
               {"certificate_number": cert.certificate_number, "recipient": cert.recipient_name}, request)
    if recipient_user:
        notify(db, recipient_user.id, "New certificate issued",
               f"{org.name} issued certificate {cert.certificate_number} to you.", f"/app/certificates/{cert.id}")
    db.commit()
    db.refresh(cert)
    return CertificateOut.from_model(cert)


@router.get("", response_model=Page[CertificateOut])
def list_certificates(q: str | None = None, status: CertificateStatus | None = None,
                      category_id: int | None = None, p: Pagination = Depends(),
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Certificate).order_by(Certificate.created_at.desc())
    if user.role == UserRole.ORGANIZATION:
        stmt = stmt.where(Certificate.organization_id == (user.organization_id or -1))
    elif user.role == UserRole.USER:
        stmt = stmt.where(or_(Certificate.recipient_user_id == user.id,
                              func.lower(Certificate.recipient_email) == user.email.lower()))
    if q:
        term = like(q[:100])
        stmt = stmt.where(or_(Certificate.certificate_number.ilike(term, escape="\\"),
                              Certificate.recipient_name.ilike(term, escape="\\"),
                              Certificate.recipient_email.ilike(term, escape="\\"),
                              Certificate.title.ilike(term, escape="\\")))
    if status:
        stmt = stmt.where(Certificate.status == status)
    if category_id:
        stmt = stmt.where(Certificate.category_id == category_id)
    items, total = paginate(db, stmt, p)
    return Page(items=[CertificateOut.from_model(c) for c in items], total=total, page=p.page,
                page_size=p.page_size)


@router.get("/{certificate_id}", response_model=CertificateOut)
def get_certificate(certificate_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cert = db.get(Certificate, certificate_id)
    if not cert or not can_view(user, cert):
        raise HTTPException(status_code=404, detail="Certificate not found")
    return CertificateOut.from_model(cert)


@router.get("/{certificate_id}/pdf")
def download_certificate_pdf(certificate_id: int, request: Request, download: bool = False,
                             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cert = db.get(Certificate, certificate_id)
    if not cert or not can_view(user, cert):
        raise HTTPException(status_code=404, detail="Certificate not found")
    if not cert.pdf_path:
        raise HTTPException(status_code=404, detail="PDF not available")
    try:
        data = storage.read_bytes(cert.pdf_path)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="PDF file is missing from storage")
    log_action(db, "certificate.downloaded", user, "certificate", cert.id, request=request)
    db.commit()
    return file_response(data, "application/pdf", f"{cert.certificate_number}.pdf", inline=not download)


@router.post("/{certificate_id}/revoke", response_model=CertificateOut)
def revoke_certificate(certificate_id: int, payload: RevokeRequest, request: Request,
                       org: Organization = Depends(get_verified_organization), db: Session = Depends(get_db)):
    cert = db.get(Certificate, certificate_id)
    if not cert or cert.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status != CertificateStatus.ACTIVE:
        raise HTTPException(status_code=409, detail=f"Certificate is already {cert.status.value}")
    cert.status = CertificateStatus.REVOKED
    cert.revoked_at = datetime.now(timezone.utc)
    cert.revocation_reason = payload.reason
    actor = db.get(User, request.state.user_id)
    log_action(db, "certificate.revoked", actor, "certificate", cert.id,
               {"certificate_number": cert.certificate_number, "reason": payload.reason}, request)
    if cert.recipient_user_id:
        notify(db, cert.recipient_user_id, "Certificate revoked",
               f"Certificate {cert.certificate_number} was revoked by {org.name}.", f"/app/certificates/{cert.id}")
    db.commit()
    db.refresh(cert)
    return CertificateOut.from_model(cert)
