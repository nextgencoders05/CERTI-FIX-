from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.enums import ApprovalDecision, CorrectionStatus, OCRStatus
from app.schemas.common import ORMModel

# Only these certificate fields can be the subject of a correction request.
CORRECTABLE_FIELDS = {
    "recipient_name": 200,
    "title": 200,
    "course_or_role": 250,
    "description": 2000,
    "start_date": 10,
    "end_date": 10,
    "issue_date": 10,
}


class DocumentOut(ORMModel):
    id: int
    original_filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    ocr_status: OCRStatus
    ocr_method: str | None
    ocr_text: str | None
    ocr_fields: dict
    ocr_confidence: float | None
    ocr_error: str | None
    delete_after: datetime | None
    created_at: datetime


class DocumentBrief(ORMModel):
    id: int
    original_filename: str
    mime_type: str
    size_bytes: int
    ocr_status: OCRStatus
    created_at: datetime


class CorrectionCreate(BaseModel):
    document_id: int
    organization_id: int | None = None
    original_certificate_number: str | None = Field(default=None, max_length=40)
    category_id: int | None = None
    original_fields: dict[str, str | None] = Field(default_factory=dict)
    requested_fields: dict[str, str]
    reason: str = Field(min_length=10, max_length=3000)

    @field_validator("requested_fields", "original_fields")
    @classmethod
    def only_correctable(cls, v: dict) -> dict:
        cleaned = {}
        for key, value in v.items():
            if key not in CORRECTABLE_FIELDS:
                raise ValueError(f"Field '{key}' cannot be corrected. Allowed: {', '.join(CORRECTABLE_FIELDS)}")
            if value is not None:
                value = str(value).strip()
                if len(value) > CORRECTABLE_FIELDS[key]:
                    raise ValueError(f"Value for '{key}' is too long")
                if key.endswith("_date") and value:
                    try:
                        date.fromisoformat(value)
                    except ValueError:
                        raise ValueError(f"'{key}' must be a date in YYYY-MM-DD format")
            cleaned[key] = value
        return cleaned

    @field_validator("requested_fields")
    @classmethod
    def non_empty(cls, v: dict) -> dict:
        if not any(val for val in v.values()):
            raise ValueError("At least one corrected field is required")
        return v


class ReviewRequest(BaseModel):
    decision: ApprovalDecision
    comment: str | None = Field(default=None, max_length=3000)
    template_id: int | None = None  # used when issuing the corrected certificate


class ApprovalOut(ORMModel):
    id: int
    decision: ApprovalDecision
    comment: str | None
    reviewer_id: int | None
    reviewer_name: str | None = None
    created_at: datetime


class CorrectionOut(ORMModel):
    id: int
    reference: str
    requester_id: int
    requester_name: str | None = None
    requester_email: str | None = None
    organization_id: int
    organization_name: str | None = None
    document_id: int
    document: DocumentBrief | None = None
    original_certificate_id: int | None
    original_certificate_number: str | None = None
    category_id: int | None
    original_fields: dict
    requested_fields: dict
    reason: str
    status: CorrectionStatus
    corrected_certificate_id: int | None
    corrected_certificate_number: str | None = None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    approvals: list[ApprovalOut] = []

    @classmethod
    def from_model(cls, cr, include_history: bool = False) -> "CorrectionOut":
        out = cls.model_validate(cr, from_attributes=True)
        out.requester_name = cr.requester.full_name if cr.requester else None
        out.requester_email = cr.requester.email if cr.requester else None
        out.organization_name = cr.organization.name if cr.organization else None
        out.document = DocumentBrief.model_validate(cr.document) if cr.document else None
        out.original_certificate_number = (cr.original_certificate.certificate_number
                                           if cr.original_certificate else None)
        out.corrected_certificate_number = (cr.corrected_certificate.certificate_number
                                            if cr.corrected_certificate else None)
        if include_history:
            out.approvals = [
                ApprovalOut(id=a.id, decision=a.decision, comment=a.comment, reviewer_id=a.reviewer_id,
                            reviewer_name=a.reviewer.full_name if a.reviewer else None, created_at=a.created_at)
                for a in cr.approvals
            ]
        else:
            out.approvals = []
        return out
