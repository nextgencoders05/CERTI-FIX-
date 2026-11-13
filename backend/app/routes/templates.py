from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import CertificateCategory, CertificateTemplate, Organization, User
from app.routes.utils import file_response
from app.schemas.certificate import TemplateCreate, TemplateOut, TemplateUpdate
from app.security.deps import get_member_organization, get_verified_organization
from app.services.audit import log_action
from app.services.certificate_service import IssueData, render_for

router = APIRouter(prefix="/templates", tags=["Certificate Templates"])


def _get_owned(db: Session, template_id: int, org: Organization) -> CertificateTemplate:
    tpl = db.get(CertificateTemplate, template_id)
    if not tpl or tpl.organization_id != org.id:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


def _check_category(db: Session, category_id: int | None) -> None:
    if category_id is not None:
        cat = db.get(CertificateCategory, category_id)
        if not cat or not cat.is_active:
            raise HTTPException(status_code=400, detail="Invalid category")


@router.get("", response_model=list[TemplateOut])
def list_templates(include_inactive: bool = False, org: Organization = Depends(get_member_organization),
                   db: Session = Depends(get_db)):
    stmt = select(CertificateTemplate).where(CertificateTemplate.organization_id == org.id)
    if not include_inactive:
        stmt = stmt.where(CertificateTemplate.is_active.is_(True))
    return db.scalars(stmt.order_by(CertificateTemplate.created_at.desc())).all()


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(payload: TemplateCreate, request: Request, org: Organization = Depends(get_verified_organization),
                    db: Session = Depends(get_db)):
    _check_category(db, payload.category_id)
    tpl = CertificateTemplate(organization_id=org.id, name=payload.name.strip(), category_id=payload.category_id,
                              title_text=payload.title_text.strip(), body_text=payload.body_text.strip(),
                              layout=payload.layout.model_dump())
    db.add(tpl)
    db.flush()
    log_action(db, "template.created", db.get(User, request.state.user_id), "template", tpl.id,
               {"name": tpl.name}, request)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, org: Organization = Depends(get_member_organization),
                 db: Session = Depends(get_db)):
    return _get_owned(db, template_id, org)


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(template_id: int, payload: TemplateUpdate, request: Request,
                    org: Organization = Depends(get_verified_organization), db: Session = Depends(get_db)):
    tpl = _get_owned(db, template_id, org)
    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        _check_category(db, data["category_id"])
    for key, value in data.items():
        if key == "layout" and value is not None:
            tpl.layout = payload.layout.model_dump()
        elif value is not None or key == "category_id":
            setattr(tpl, key, value.strip() if isinstance(value, str) else value)
    log_action(db, "template.updated", db.get(User, request.state.user_id), "template", tpl.id,
               {"fields": list(data)}, request)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/{template_id}", status_code=204)
def deactivate_template(template_id: int, request: Request, org: Organization = Depends(get_verified_organization),
                        db: Session = Depends(get_db)):
    """Templates are soft-deleted so previously issued certificates keep their reference."""
    tpl = _get_owned(db, template_id, org)
    tpl.is_active = False
    log_action(db, "template.deactivated", db.get(User, request.state.user_id), "template", tpl.id, request=request)
    db.commit()


@router.get("/{template_id}/preview")
def preview_template(template_id: int, org: Organization = Depends(get_member_organization),
                     db: Session = Depends(get_db)):
    """Render a watermarked PREVIEW PDF with sample data. Previews are never valid certificates."""
    tpl = _get_owned(db, template_id, org)
    sample = IssueData(recipient_name="Jane Doe", title=tpl.title_text, issue_date=date.today(),
                       course_or_role="Sample Programme", start_date=date(date.today().year, 1, 1),
                       end_date=date(date.today().year, 3, 31))
    pdf = render_for(org, tpl, "PREVIEW-0000", sample, tpl.category.name if tpl.category else None,
                     data_hash="0" * 64, is_preview=True)
    return file_response(pdf, "application/pdf", f"template-{tpl.id}-preview.pdf")
