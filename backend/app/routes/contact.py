from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import ContactMessage
from app.schemas.misc import ContactCreate
from app.services.audit import log_action
from app.services.notifications import notify_admins

router = APIRouter(prefix="/contact", tags=["Contact"])


@router.post("", status_code=201)
def submit_contact(payload: ContactCreate, request: Request, db: Session = Depends(get_db)):
    msg = ContactMessage(name=payload.name.strip(), email=payload.email.lower(), subject=payload.subject.strip(),
                         message=payload.message.strip())
    db.add(msg)
    db.flush()
    log_action(db, "contact.submitted", None, "contact_message", msg.id, request=request)
    notify_admins(db, "New contact message", f"{msg.name}: {msg.subject}", "/admin/messages")
    db.commit()
    return {"id": msg.id, "detail": "Thank you. Your message has been received."}
