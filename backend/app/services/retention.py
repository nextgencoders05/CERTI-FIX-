"""File retention policy: purge uploaded documents past their retention date.

Documents referenced by an open (submitted / under review) correction request are kept.
Documents referenced by a closed request have their *file* removed but the metadata row is
kept so the correction history stays intact.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CorrectionRequest, CorrectionStatus, UploadedDocument
from app.services import storage

OPEN_STATUSES = (CorrectionStatus.SUBMITTED, CorrectionStatus.UNDER_REVIEW)


def purge_expired_documents(db: Session, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    expired = db.scalars(select(UploadedDocument).where(UploadedDocument.delete_after.is_not(None),
                                                        UploadedDocument.delete_after <= now)).all()
    deleted, files_removed, kept = 0, 0, 0
    for doc in expired:
        statuses = set(db.scalars(select(CorrectionRequest.status)
                                  .where(CorrectionRequest.document_id == doc.id)).all())
        if statuses & set(OPEN_STATUSES):
            kept += 1
            continue
        storage.delete(doc.stored_path)
        if statuses:
            doc.stored_path = ""
            doc.ocr_text = None
            doc.delete_after = None
            files_removed += 1
        else:
            db.delete(doc)
            deleted += 1
    db.commit()
    return {"deleted": deleted, "files_removed": files_removed, "kept_open_requests": kept}
