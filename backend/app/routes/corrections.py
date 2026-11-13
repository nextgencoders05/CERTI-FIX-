"""Certificate correction workflow.

User uploads certificate -> OCR suggests fields -> user submits correction request ->
issuing organization reviews -> approves (a NEW authorized certificate is issued, the
original record is marked superseded) or rejects. The uploaded document is never edited.
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import (ApprovalDecision, ApprovalRecord, Certificate, CertificateCategory, CertificateStatus,
                        CertificateTemplate, CorrectionRequest, CorrectionStatus, Organization, OrganizationStatus,
                        UploadedDocument, User, UserRole)
from app.routes.utils import Pagination, like, paginate
from app.schemas.common import Page
from app.schemas.correction import CorrectionCreate, CorrectionOut, ReviewRequest
from app.security.deps import get_current_user, get_verified_organization, require_roles
from app.services.audit import log_action
from app.services.certificate_service import IssueData, issue_certificate
from app.services.identifiers import new_correction_reference
from app.services.notifications import notify, notify_organization

router = APIRouter(prefix="/corrections", tags=["Correction Requests"])
OPEN = (CorrectionStatus.SUBMITTED, CorrectionStatus.UNDER_REVIEW)


def _visible(user: User, cr: CorrectionRequest) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    if user.role == UserRole.ORGANIZATION:
        return user.organization_id == cr.organization_id
    return cr.requester_id == user.id


@router.post("", response_model=CorrectionOut, status_code=201)
def create_correction(payload: CorrectionCreate, request: Request,
                      user: User = Depends(require_roles(UserRole.USER)), db: Session = Depends(get_db)):
    doc = db.get(UploadedDocument, payload.document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")

    original_cert = None
    if payload.original_certificate_number:
        original_cert = db.scalar(select(Certificate).where(
            func.upper(Certificate.certificate_number) == payload.original_certificate_number.strip().upper()))

    if original_cert is not None:
        if payload.organization_id and payload.organization_id != original_cert.organization_id:
            raise HTTPException(status_code=400, detail="This certificate was issued by a different organization")
        if original_cert.status != CertificateStatus.ACTIVE:
            raise HTTPException(status_code=409, detail=f"Certificate {original_cert.certificate_number} is "
                                                        f"{original_cert.status.value} and cannot be corrected")
        org_id = original_cert.organization_id
    else:
        if not payload.organization_id:
            raise HTTPException(status_code=400, detail="Select the issuing organization for this certificate")
        org_id = payload.organization_id

    org = db.get(Organization, org_id)
    if not org or org.status != OrganizationStatus.VERIFIED:
        raise HTTPException(status_code=400, detail="The selected organization is not a verified issuer")
    if payload.category_id is not None and not db.get(CertificateCategory, payload.category_id):
        raise HTTPException(status_code=400, detail="Invalid category")

    duplicate = db.scalar(select(func.count()).select_from(CorrectionRequest).where(
        CorrectionRequest.document_id == doc.id, CorrectionRequest.organization_id == org.id,
        CorrectionRequest.status.in_(OPEN)))
    if duplicate:
        raise HTTPException(status_code=409, detail="An open correction request already exists for this document")

    original_fields = dict(payload.original_fields)
    if original_cert is not None:  # authoritative values from the issuer's record
        original_fields = {
            "recipient_name": original_cert.recipient_name, "title": original_cert.title,
            "course_or_role": original_cert.course_or_role, "description": original_cert.description,
            "start_date": original_cert.start_date.isoformat() if original_cert.start_date else None,
            "end_date": original_cert.end_date.isoformat() if original_cert.end_date else None,
            "issue_date": original_cert.issue_date.isoformat(),
        }

    cr = CorrectionRequest(
        reference=new_correction_reference(), requester_id=user.id, organization_id=org.id, document_id=doc.id,
        original_certificate_id=original_cert.id if original_cert else None,
        category_id=payload.category_id or (original_cert.category_id if original_cert else None),
        original_fields=original_fields, requested_fields=payload.requested_fields, reason=payload.reason.strip(),
        status=CorrectionStatus.SUBMITTED,
    )
    db.add(cr)
    db.flush()
    log_action(db, "correction.submitted", user, "correction_request", cr.id,
               {"reference": cr.reference, "organization_id": org.id,
                "fields": sorted(payload.requested_fields)}, request)
    notify_organization(db, org.id, "New correction request",
                        f"{user.full_name} submitted correction request {cr.reference}.", f"/org/corrections/{cr.id}")
    db.commit()
    db.refresh(cr)
    return CorrectionOut.from_model(cr, include_history=True)


@router.get("", response_model=Page[CorrectionOut])
def list_corrections(status: CorrectionStatus | None = None, q: str | None = None, p: Pagination = Depends(),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(CorrectionRequest).order_by(CorrectionRequest.created_at.desc())
    if user.role == UserRole.USER:
        stmt = stmt.where(CorrectionRequest.requester_id == user.id)
    elif user.role == UserRole.ORGANIZATION:
        stmt = stmt.where(CorrectionRequest.organization_id == (user.organization_id or -1))
    if status:
        stmt = stmt.where(CorrectionRequest.status == status)
    if q:
        term = like(q[:100])
        stmt = stmt.join(User, User.id == CorrectionRequest.requester_id).where(
            or_(CorrectionRequest.reference.ilike(term, escape="\\"), User.full_name.ilike(term, escape="\\"),
                User.email.ilike(term, escape="\\")))
    items, total = paginate(db, stmt, p)
    return Page(items=[CorrectionOut.from_model(c) for c in items], total=total, page=p.page, page_size=p.page_size)


@router.get("/{correction_id}", response_model=CorrectionOut)
def get_correction(correction_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cr = db.get(CorrectionRequest, correction_id)
    if not cr or not _visible(user, cr):
        raise HTTPException(status_code=404, detail="Correction request not found")
    return CorrectionOut.from_model(cr, include_history=True)


@router.post("/{correction_id}/cancel", response_model=CorrectionOut)
def cancel_correction(correction_id: int, request: Request, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    cr = db.get(CorrectionRequest, correction_id)
    if not cr or cr.requester_id != user.id:
        raise HTTPException(status_code=404, detail="Correction request not found")
    if cr.status not in OPEN:
        raise HTTPException(status_code=409, detail=f"Request is already {cr.status.value}")
    cr.status = CorrectionStatus.CANCELLED
    log_action(db, "correction.cancelled", user, "correction_request", cr.id, {"reference": cr.reference}, request)
    notify_organization(db, cr.organization_id, "Correction request cancelled",
                        f"{cr.reference} was cancelled by the requester.", f"/org/corrections/{cr.id}")
    db.commit()
    db.refresh(cr)
    return CorrectionOut.from_model(cr, include_history=True)


def _parse_date(value: str | None, field: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date for {field}; expected YYYY-MM-DD")


def _build_issue_data(cr: CorrectionRequest, requester: User, template: CertificateTemplate) -> IssueData:
    base = dict(cr.original_fields or {})
    base.update({k: v for k, v in (cr.requested_fields or {}).items() if v})
    original = cr.original_certificate
    recipient_name = (base.get("recipient_name") or "").strip()
    if not recipient_name:
        raise HTTPException(status_code=400, detail="Recipient name is missing; it must be present in the original "
                                                    "or requested fields before approval")
    issue_date = _parse_date(base.get("issue_date"), "issue_date") or date.today()
    data = IssueData(
        recipient_name=recipient_name,
        recipient_email=requester.email,
        recipient_user_id=requester.id,
        title=(base.get("title") or template.title_text).strip(),
        course_or_role=base.get("course_or_role"),
        description=base.get("description"),
        category_id=cr.category_id or template.category_id,
        start_date=_parse_date(base.get("start_date"), "start_date"),
        end_date=_parse_date(base.get("end_date"), "end_date"),
        issue_date=issue_date,
        extra_fields=dict(original.extra_fields) if original else {},
    )
    if data.start_date and data.end_date and data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="End date cannot be before start date")
    return data


@router.post("/{correction_id}/review", response_model=CorrectionOut)
def review_correction(correction_id: int, payload: ReviewRequest, request: Request,
                      org: Organization = Depends(get_verified_organization), db: Session = Depends(get_db)):
    reviewer = db.get(User, request.state.user_id)
    cr = db.get(CorrectionRequest, correction_id)
    if not cr or cr.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Correction request not found")
    if cr.status not in OPEN:
        raise HTTPException(status_code=409, detail=f"Request is already {cr.status.value}")

    comment = (payload.comment or "").strip() or None
    if payload.decision == ApprovalDecision.REJECTED and not comment:
        raise HTTPException(status_code=400, detail="A reason is required when rejecting a request")

    if payload.decision == ApprovalDecision.UNDER_REVIEW:
        cr.status = CorrectionStatus.UNDER_REVIEW
        msg = f"{org.name} is reviewing correction request {cr.reference}."
    elif payload.decision == ApprovalDecision.REJECTED:
        cr.status = CorrectionStatus.REJECTED
        cr.reviewed_at = datetime.now(timezone.utc)
        msg = f"Correction request {cr.reference} was rejected by {org.name}."
    else:  # APPROVED -> issue a new, authorized, corrected certificate
        template = None
        if payload.template_id:
            template = db.get(CertificateTemplate, payload.template_id)
        elif cr.original_certificate and cr.original_certificate.template_id:
            template = db.get(CertificateTemplate, cr.original_certificate.template_id)
        if not template or template.organization_id != org.id or not template.is_active:
            raise HTTPException(status_code=400, detail="Select an active certificate template to issue the "
                                                        "corrected certificate")
        original = cr.original_certificate
        if original is not None and original.status != CertificateStatus.ACTIVE:
            raise HTTPException(status_code=409, detail=f"Original certificate is {original.status.value}")
        data = _build_issue_data(cr, cr.requester, template)
        new_cert = issue_certificate(db, org=org, template=template, data=data, issuer=reviewer,
                                     supersedes=original, correction_request_id=cr.id)
        cr.status = CorrectionStatus.APPROVED
        cr.reviewed_at = datetime.now(timezone.utc)
        cr.corrected_certificate_id = new_cert.id
        log_action(db, "certificate.issued", reviewer, "certificate", new_cert.id,
                   {"certificate_number": new_cert.certificate_number, "correction": cr.reference,
                    "supersedes": original.certificate_number if original else None}, request)
        msg = (f"Correction request {cr.reference} was approved. Corrected certificate "
               f"{new_cert.certificate_number} has been issued.")

    db.add(ApprovalRecord(correction_request_id=cr.id, reviewer_id=reviewer.id, organization_id=org.id,
                          decision=payload.decision, comment=comment))
    log_action(db, f"correction.{payload.decision.value}", reviewer, "correction_request", cr.id,
               {"reference": cr.reference, "comment": comment}, request)
    notify(db, cr.requester_id, "Correction request update", msg, f"/app/corrections/{cr.id}")
    db.commit()
    db.refresh(cr)
    return CorrectionOut.from_model(cr, include_history=True)
