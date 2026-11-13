"""FastAPI dependencies for authentication and role-based access control."""
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import Organization, OrganizationStatus, User, UserRole
from app.security.tokens import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _CREDENTIALS_ERROR
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise _CREDENTIALS_ERROR
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise _CREDENTIALS_ERROR
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _CREDENTIALS_ERROR
    request.state.user_id = user.id
    return user


def require_roles(*roles: UserRole) -> Callable[..., User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission "
                                                                              "to perform this action")
        return user

    return checker


require_admin = require_roles(UserRole.ADMIN)
require_org_member = require_roles(UserRole.ORGANIZATION)


def get_member_organization(user: User = Depends(require_org_member), db: Session = Depends(get_db)) -> Organization:
    """Organization of the current org-role user (any status)."""
    if user.organization_id is None:
        raise HTTPException(status_code=403, detail="Your account is not linked to an organization")
    org = db.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(status_code=403, detail="Organization not found")
    return org


def get_verified_organization(org: Organization = Depends(get_member_organization)) -> Organization:
    """Only verified organizations may issue certificates or review corrections."""
    if org.status != OrganizationStatus.VERIFIED:
        raise HTTPException(
            status_code=403,
            detail=f"Your organization is '{org.status.value}'. Only verified organizations can perform this action.",
        )
    return org
