from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import (Certificate, CertificateStatus, CertificateTemplate, CorrectionRequest, CorrectionStatus,
                        Organization, OrganizationStatus, User)
from app.schemas.organization import OrganizationOut, OrganizationPublic, OrganizationUpdate
from app.security.deps import get_member_organization
from app.services import storage
from app.services.audit import log_action
from app.services.file_validation import LOGO_TYPES, validate_upload
from app.routes.utils import file_response

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.get("", response_model=list[OrganizationPublic])
def list_verified_organizations(q: str | None = None, db: Session = Depends(get_db)):
    """Public list of verified issuers (used when a user chooses who should review a correction)."""
    stmt = select(Organization).where(Organization.status == OrganizationStatus.VERIFIED).order_by(Organization.name)
    if q:
        stmt = stmt.where(Organization.name.ilike(f"%{q[:100]}%"))
    return db.scalars(stmt.limit(200)).all()


@router.get("/me", response_model=OrganizationOut)
def my_organization(org: Organization = Depends(get_member_organization)):
    return OrganizationOut.from_model(org)


@router.put("/me", response_model=OrganizationOut)
def update_my_organization(payload: OrganizationUpdate, request: Request,
                           org: Organization = Depends(get_member_organization), db: Session = Depends(get_db)):
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(org, k, v.strip() if isinstance(v, str) else v)
    actor = db.get(User, request.state.user_id)
    log_action(db, "organization.updated", actor, "organization", org.id, {"fields": list(changes)}, request)
    db.commit()
    db.refresh(org)
    return OrganizationOut.from_model(org)


@router.post("/me/logo", response_model=OrganizationOut)
async def upload_logo(request: Request, file: UploadFile = File(...),
                      org: Organization = Depends(get_member_organization), db: Session = Depends(get_db)):
    vf = await validate_upload(file, allowed=LOGO_TYPES, max_bytes=2 * 1024 * 1024)
    old = org.logo_path
    org.logo_path = storage.save_bytes("logos", vf.data, vf.extension)
    actor = db.get(User, request.state.user_id)
    log_action(db, "organization.logo_updated", actor, "organization", org.id, request=request)
    db.commit()
    storage.delete(old)
    db.refresh(org)
    return OrganizationOut.from_model(org)


@router.get("/me/stats")
def my_stats(org: Organization = Depends(get_member_organization), db: Session = Depends(get_db)):
    def count(model, *conds):
        return db.scalar(select(func.count()).select_from(model).where(*conds)) or 0

    return {
        "status": org.status.value,
        "templates": count(CertificateTemplate, CertificateTemplate.organization_id == org.id,
                           CertificateTemplate.is_active.is_(True)),
        "certificates_issued": count(Certificate, Certificate.organization_id == org.id),
        "certificates_active": count(Certificate, Certificate.organization_id == org.id,
                                     Certificate.status == CertificateStatus.ACTIVE),
        "certificates_revoked": count(Certificate, Certificate.organization_id == org.id,
                                      Certificate.status == CertificateStatus.REVOKED),
        "corrections_pending": count(CorrectionRequest, CorrectionRequest.organization_id == org.id,
                                     CorrectionRequest.status.in_([CorrectionStatus.SUBMITTED,
                                                                   CorrectionStatus.UNDER_REVIEW])),
        "corrections_approved": count(CorrectionRequest, CorrectionRequest.organization_id == org.id,
                                      CorrectionRequest.status == CorrectionStatus.APPROVED),
        "corrections_rejected": count(CorrectionRequest, CorrectionRequest.organization_id == org.id,
                                      CorrectionRequest.status == CorrectionStatus.REJECTED),
    }


@router.get("/{org_id}/logo")
def organization_logo(org_id: int, db: Session = Depends(get_db)):
    """Logos are public branding (displayed on verification pages); served via API, not static storage."""
    org = db.get(Organization, org_id)
    if not org or not org.logo_path:
        raise HTTPException(status_code=404, detail="Logo not found")
    try:
        data = storage.read_bytes(org.logo_path)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="Logo not found")
    mime = "image/png" if org.logo_path.endswith(".png") else "image/jpeg"
    return file_response(data, mime, "logo." + org.logo_path.rsplit(".", 1)[-1])
