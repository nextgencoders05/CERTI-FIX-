from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Organization, OrganizationStatus, User, UserRole
from app.schemas.auth import (ChangePasswordRequest, LoginRequest, OrganizationRegisterRequest, ProfileUpdate,
                              RegisterRequest, TokenResponse, UserOut)
from app.security.deps import get_current_user
from app.security.passwords import hash_password, verify_password
from app.security.tokens import create_access_token
from app.services.audit import log_action
from app.services.identifiers import slugify
from app.services.notifications import notify_admins

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Pre-computed hash used to keep login timing similar for unknown emails.
_DUMMY_HASH = hash_password("dummy-password-for-timing-1")


def _email_taken(db: Session, email: str) -> bool:
    return bool(db.scalar(select(func.count()).select_from(User).where(func.lower(User.email) == email.lower())))


def _token_response(user: User) -> TokenResponse:
    token, expires = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token, expires_in=expires, user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    if _email_taken(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(email=payload.email.lower(), full_name=payload.full_name.strip(), phone=payload.phone,
                hashed_password=hash_password(payload.password), role=UserRole.USER)
    db.add(user)
    db.flush()
    log_action(db, "user.registered", user, "user", user.id, request=request)
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post("/register-organization", response_model=TokenResponse, status_code=201)
def register_organization(payload: OrganizationRegisterRequest, request: Request, db: Session = Depends(get_db)):
    if _email_taken(db, payload.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    base_slug = slugify(payload.organization_name)
    slug, n = base_slug, 1
    while db.scalar(select(func.count()).select_from(Organization).where(Organization.slug == slug)):
        n += 1
        slug = f"{base_slug}-{n}"
    org = Organization(name=payload.organization_name.strip(), slug=slug, email=payload.organization_email.lower(),
                       website=payload.website, phone=payload.phone, address=payload.address,
                       registration_number=payload.registration_number, description=payload.description,
                       status=OrganizationStatus.PENDING)
    db.add(org)
    db.flush()
    user = User(email=payload.email.lower(), full_name=payload.full_name.strip(), phone=payload.phone,
                hashed_password=hash_password(payload.password), role=UserRole.ORGANIZATION,
                organization_id=org.id)
    db.add(user)
    db.flush()
    log_action(db, "organization.registered", user, "organization", org.id, {"name": org.name}, request)
    notify_admins(db, "New organization pending verification",
                  f"{org.name} registered and is awaiting verification.", "/admin/organizations")
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None:
        verify_password(payload.password, _DUMMY_HASH)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not verify_password(payload.password, user.hashed_password):
        log_action(db, "auth.login_failed", user, "user", user.id, request=request)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    log_action(db, "auth.login", user, "user", user.id, request=request)
    db.commit()
    return _token_response(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_me(payload: ProfileUpdate, request: Request, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(user, k, v.strip() if isinstance(v, str) else v)
    log_action(db, "user.profile_updated", user, "user", user.id, {"fields": list(changes)}, request)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=204)
def change_password(payload: ChangePasswordRequest, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    log_action(db, "user.password_changed", user, "user", user.id, request=request)
    db.commit()
