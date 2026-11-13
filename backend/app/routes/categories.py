from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Certificate, CertificateCategory, User
from app.schemas.certificate import CategoryCreate, CategoryOut, CategoryUpdate
from app.security.deps import require_admin
from app.services.audit import log_action
from app.services.identifiers import slugify

router = APIRouter(prefix="/categories", tags=["Certificate Categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(include_inactive: bool = False, db: Session = Depends(get_db)):
    stmt = select(CertificateCategory).order_by(CertificateCategory.is_system.desc(), CertificateCategory.name)
    if not include_inactive:
        stmt = stmt.where(CertificateCategory.is_active.is_(True))
    return db.scalars(stmt).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryCreate, request: Request, admin: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    slug = slugify(payload.name)
    if db.scalar(select(func.count()).select_from(CertificateCategory).where(
            (CertificateCategory.slug == slug) | (func.lower(CertificateCategory.name) == payload.name.lower()))):
        raise HTTPException(status_code=409, detail="A category with this name already exists")
    cat = CertificateCategory(name=payload.name.strip(), slug=slug, description=payload.description)
    db.add(cat)
    db.flush()
    log_action(db, "category.created", admin, "category", cat.id, {"name": cat.name}, request)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, payload: CategoryUpdate, request: Request,
                    admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    cat = db.get(CertificateCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        new_slug = slugify(data["name"])
        clash = db.scalar(select(CertificateCategory).where(CertificateCategory.slug == new_slug,
                                                            CertificateCategory.id != cat.id))
        if clash:
            raise HTTPException(status_code=409, detail="A category with this name already exists")
        cat.name, cat.slug = data["name"].strip(), new_slug
    if "description" in data:
        cat.description = data["description"]
    if "is_active" in data and data["is_active"] is not None:
        cat.is_active = data["is_active"]
    log_action(db, "category.updated", admin, "category", cat.id, data, request)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, request: Request, admin: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    cat = db.get(CertificateCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.is_system:
        raise HTTPException(status_code=400, detail="Built-in categories cannot be deleted; deactivate instead")
    in_use = db.scalar(select(func.count()).select_from(Certificate).where(Certificate.category_id == cat.id))
    if in_use:
        raise HTTPException(status_code=409, detail="Category is used by issued certificates; deactivate instead")
    log_action(db, "category.deleted", admin, "category", cat.id, {"name": cat.name}, request)
    db.delete(cat)
    db.commit()
