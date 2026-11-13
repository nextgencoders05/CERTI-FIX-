from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import OrganizationStatus
from app.schemas.common import ORMModel


class OrganizationOut(ORMModel):
    id: int
    name: str
    slug: str
    email: str
    website: str | None
    phone: str | None
    address: str | None
    description: str | None
    registration_number: str | None
    has_logo: bool = False
    status: OrganizationStatus
    status_note: str | None
    verified_at: datetime | None
    created_at: datetime

    @classmethod
    def from_model(cls, org) -> "OrganizationOut":
        out = cls.model_validate(org)
        out.has_logo = bool(org.logo_path)
        return out


class OrganizationPublic(ORMModel):
    id: int
    name: str
    website: str | None
    status: OrganizationStatus


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    email: EmailStr | None = None
    website: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=1000)
    description: str | None = Field(default=None, max_length=3000)
    registration_number: str | None = Field(default=None, max_length=100)


class OrganizationStatusUpdate(BaseModel):
    status: OrganizationStatus
    note: str | None = Field(default=None, max_length=2000)
