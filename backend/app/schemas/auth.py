import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import OrganizationStatus, UserRole
from app.schemas.common import ORMModel


def _validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    password: str
    phone: str | None = Field(default=None, max_length=40)

    _pw = field_validator("password")(_validate_password_strength)


class OrganizationRegisterRequest(BaseModel):
    # Account of the organization administrator
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    password: str
    # Organization details
    organization_name: str = Field(min_length=2, max_length=200)
    organization_email: EmailStr
    website: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=1000)
    registration_number: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=3000)

    _pw = field_validator("password")(_validate_password_strength)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class OrganizationBrief(ORMModel):
    id: int
    name: str
    status: OrganizationStatus


class UserOut(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    phone: str | None
    role: UserRole
    is_active: bool
    organization_id: int | None
    organization: OrganizationBrief | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    phone: str | None = Field(default=None, max_length=40)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    _pw = field_validator("new_password")(_validate_password_strength)


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    role: UserRole | None = None
