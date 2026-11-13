from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class NotificationOut(ORMModel):
    id: int
    title: str
    message: str
    link: str | None
    is_read: bool
    created_at: datetime


class AuditLogOut(ORMModel):
    id: int
    actor_id: int | None
    actor_email: str | None = None
    action: str
    entity_type: str | None
    entity_id: str | None
    details: dict
    ip_address: str | None
    created_at: datetime


class ContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=10, max_length=5000)


class ContactOut(ORMModel):
    id: int
    name: str
    email: str
    subject: str
    message: str
    is_resolved: bool
    created_at: datetime
