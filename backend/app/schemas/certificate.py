from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import CertificateStatus
from app.schemas.common import ORMModel


# ---------- Categories ----------
class CategoryOut(ORMModel):
    id: int
    name: str
    slug: str
    description: str | None
    is_active: bool
    is_system: bool


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


# ---------- Templates ----------
HEX = r"^#[0-9A-Fa-f]{6}$"


class TemplateLayout(BaseModel):
    orientation: str = Field(default="landscape", pattern="^(landscape|portrait)$")
    primary_color: str = Field(default="#1E3A8A", pattern=HEX)
    accent_color: str = Field(default="#7C3AED", pattern=HEX)
    border_style: str = Field(default="double", pattern="^(none|simple|double|ornate)$")
    font: str = Field(default="Helvetica", pattern="^(Helvetica|Times-Roman|Courier)$")
    show_logo: bool = True
    show_qr: bool = True
    signatory_name: str | None = Field(default=None, max_length=120)
    signatory_title: str | None = Field(default=None, max_length=120)


class TemplateBase(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    category_id: int | None = None
    title_text: str = Field(default="Certificate of Completion", min_length=2, max_length=200)
    body_text: str = Field(
        default="has successfully completed {course_or_role} from {start_date} to {end_date}.",
        min_length=5, max_length=2000,
    )
    layout: TemplateLayout = TemplateLayout()


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    category_id: int | None = None
    title_text: str | None = Field(default=None, min_length=2, max_length=200)
    body_text: str | None = Field(default=None, min_length=5, max_length=2000)
    layout: TemplateLayout | None = None
    is_active: bool | None = None


class TemplateOut(ORMModel):
    id: int
    organization_id: int
    category_id: int | None
    name: str
    title_text: str
    body_text: str
    layout: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------- Certificates ----------
class CertificateCreate(BaseModel):
    template_id: int
    recipient_name: str = Field(min_length=2, max_length=200)
    recipient_email: EmailStr | None = None
    title: str | None = Field(default=None, max_length=200)
    course_or_role: str | None = Field(default=None, max_length=250)
    description: str | None = Field(default=None, max_length=2000)
    category_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    issue_date: date | None = None
    extra_fields: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def check_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        if len(self.extra_fields) > 20:
            raise ValueError("At most 20 extra fields are allowed")
        for k, v in self.extra_fields.items():
            if len(k) > 50 or len(v) > 300:
                raise ValueError("Extra field keys must be <=50 chars and values <=300 chars")
        return self


class RevokeRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class CertificateOut(ORMModel):
    id: int
    certificate_number: str
    organization_id: int
    organization_name: str | None = None
    template_id: int | None
    category_id: int | None
    category_name: str | None = None
    recipient_name: str
    recipient_email: str | None
    recipient_user_id: int | None
    title: str
    course_or_role: str | None
    description: str | None
    start_date: date | None
    end_date: date | None
    issue_date: date
    extra_fields: dict
    status: CertificateStatus
    supersedes_id: int | None
    supersedes_number: str | None = None
    correction_request_id: int | None
    has_pdf: bool = False
    revoked_at: datetime | None
    revocation_reason: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, c) -> "CertificateOut":
        out = cls.model_validate(c)
        out.organization_name = c.organization.name if c.organization else None
        out.category_name = c.category.name if c.category else None
        out.supersedes_number = c.supersedes.certificate_number if c.supersedes else None
        out.has_pdf = bool(c.pdf_path)
        return out


class VerificationOut(BaseModel):
    result: str
    certificate_number: str | None = None
    recipient_name: str | None = None
    title: str | None = None
    course_or_role: str | None = None
    organization_name: str | None = None
    organization_verified: bool | None = None
    category: str | None = None
    issue_date: date | None = None
    status: str | None = None
    revoked_at: datetime | None = None
    revocation_reason: str | None = None
    superseded_by: str | None = None
    supersedes: str | None = None
    is_corrected_reissue: bool = False
    message: str
