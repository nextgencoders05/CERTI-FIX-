from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import (AuditLog, Certificate, CertificateStatus, ContactMessage, CorrectionRequest,
                        CorrectionStatus, Organization, OrganizationStatus, UploadedDocument, User, UserRole,
                        VerificationRecord)
from app.routes.utils import Pagination, like, paginate
from app.schemas.auth import AdminUserUpdate, UserOut
from app.schemas.common import Page
from app.schemas.misc import AuditLogOut, ContactOut
from app.schemas.organization import OrganizationOut, OrganizationStatusUpdate
from app.security.deps import require_admin
from app.services.audit import log_action
from app.services.notifications import notify_organization
from app.services.retention import purge_expired_documents

router = APIRouter(prefix="/admin", tags=["Administration"], dependencies=[Depends(require_admin)])


def _count(db: Session, model, *conds) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*conds)) or 0


@router.get("/stats")
def platform_stats(db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=30)
    return {
        "users": _count(db, User, User.role == UserRole.USER),
        "organization_accounts": _count(db, User, User.role == UserRole.ORGANIZATION),
        "organizations": _count(db, Organization),
        "organizations_pending": _count(db, Organization, Organization.status == OrganizationStatus.PENDING),
        "organizations_verified": _count(db, Organization, Organization.status == OrganizationStatus.VERIFIED),
        "certificates": _count(db, Certificate),
        "certificates_active": _count(db, Certificate, Certificate.status == CertificateStatus.ACTIVE),
        "documents": _count(db, UploadedDocument),
        "corrections_open": _count(db, CorrectionRequest, CorrectionRequest.status.in_(
            [CorrectionStatus.SUBMITTED, CorrectionStatus.UNDER_REVIEW])),
        "corrections_approved": _count(db, CorrectionRequest, CorrectionRequest.status == CorrectionStatus.APPROVED),
        "corrections_rejected": _count(db, CorrectionRequest, CorrectionRequest.status == CorrectionStatus.REJECTED),
        "verifications_30d": _count(db, VerificationRecord, VerificationRecord.created_at >= since),
        "contact_open": _count(db, ContactMessage, ContactMessage.is_resolved.is_(False)),
    }


# ---------- Users ----------
@router.get("/users", response_model=Page[UserOut])
def list_users(q: str | None = None, role: UserRole | None = None, is_active: bool | None = None,
               p: Pagination = Depends(), db: Session = Depends(get_db)):
    stmt = select(User).order_by(User.created_at.desc())
    if q:
        term = like(q[:100])
        stmt = stmt.where(or_(User.email.ilike(term, escape="\\"), User.full_name.ilike(term, escape="\\")))
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    items, total = paginate(db, stmt, p)
    return Page(items=items, total=total, page=p.page, page_size=p.page_size)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: AdminUserUpdate, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role or status")
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    if data.get("role") == UserRole.ORGANIZATION and not user.organization_id:
        raise HTTPException(status_code=400, detail="User is not linked to an organization")
    for k, v in data.items():
        setattr(user, k, v)
    log_action(db, "admin.user_updated", admin, "user", user.id,
               {k: (v.value if hasattr(v, "value") else v) for k, v in data.items()}, request)
    db.commit()
    db.refresh(user)
    return user


# ---------- Organizations ----------
@router.get("/organizations", response_model=Page[OrganizationOut])
def list_organizations(q: str | None = None, status: OrganizationStatus | None = None, p: Pagination = Depends(),
                       db: Session = Depends(get_db)):
    stmt = select(Organization).order_by(Organization.created_at.desc())
    if q:
        term = like(q[:100])
        stmt = stmt.where(or_(Organization.name.ilike(term, escape="\\"), Organization.email.ilike(term, escape="\\")))
    if status:
        stmt = stmt.where(Organization.status == status)
    items, total = paginate(db, stmt, p)
    return Page(items=[OrganizationOut.from_model(o) for o in items], total=total, page=p.page,
                page_size=p.page_size)


@router.get("/organizations/{org_id}", response_model=OrganizationOut)
def get_organization(org_id: int, db: Session = Depends(get_db)):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationOut.from_model(org)


@router.post("/organizations/{org_id}/status", response_model=OrganizationOut)
def set_organization_status(org_id: int, payload: OrganizationStatusUpdate, request: Request,
                            admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if payload.status in (OrganizationStatus.REJECTED, OrganizationStatus.SUSPENDED) and not payload.note:
        raise HTTPException(status_code=400, detail="A note is required when rejecting or suspending")
    previous = org.status
    org.status = payload.status
    org.status_note = payload.note
    if payload.status == OrganizationStatus.VERIFIED:
        org.verified_at = datetime.now(timezone.utc)
        org.verified_by_id = admin.id
    log_action(db, "admin.organization_status", admin, "organization", org.id,
               {"from": previous.value, "to": payload.status.value, "note": payload.note}, request)
    notify_organization(db, org.id, "Organization status updated",
                        f"Your organization status is now '{payload.status.value}'."
                        + (f" Note: {payload.note}" if payload.note else ""), "/org/profile")
    db.commit()
    db.refresh(org)
    return OrganizationOut.from_model(org)


# ---------- Audit logs ----------
@router.get("/audit-logs", response_model=Page[AuditLogOut])
def list_audit_logs(action: str | None = None, entity_type: str | None = None, actor_id: int | None = None,
                    p: Pagination = Depends(), db: Session = Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    if action:
        stmt = stmt.where(AuditLog.action.ilike(like(action[:80]), escape="\\"))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    items, total = paginate(db, stmt, p)
    out = []
    for log in items:
        item = AuditLogOut.model_validate(log)
        item.actor_email = log.actor.email if log.actor else None
        out.append(item)
    return Page(items=out, total=total, page=p.page, page_size=p.page_size)


# ---------- Contact messages ----------
@router.get("/contact-messages", response_model=Page[ContactOut])
def list_contact_messages(resolved: bool | None = None, p: Pagination = Depends(), db: Session = Depends(get_db)):
    stmt = select(ContactMessage).order_by(ContactMessage.created_at.desc())
    if resolved is not None:
        stmt = stmt.where(ContactMessage.is_resolved.is_(resolved))
    items, total = paginate(db, stmt, p)
    return Page(items=items, total=total, page=p.page, page_size=p.page_size)


@router.post("/contact-messages/{message_id}/resolve", response_model=ContactOut)
def resolve_contact_message(message_id: int, request: Request, admin: User = Depends(require_admin),
                            db: Session = Depends(get_db)):
    msg = db.get(ContactMessage, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.is_resolved = True
    log_action(db, "admin.contact_resolved", admin, "contact_message", msg.id, request=request)
    db.commit()
    db.refresh(msg)
    return msg


# ---------- Retention ----------
@router.post("/retention/run")
def run_retention(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    result = purge_expired_documents(db)
    log_action(db, "admin.retention_run", admin, "system", None, result, request)
    db.commit()
    return result
