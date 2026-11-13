import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database.session import get_db
from app.models import CorrectionRequest, OCRStatus, UploadedDocument, User, UserRole
from app.ocr import OCRError, OCRUnavailableError, extract_fields, extract_text
from app.routes.utils import Pagination, file_response, paginate
from app.schemas.common import Page
from app.schemas.correction import DocumentBrief, DocumentOut
from app.security.deps import get_current_user, require_roles
from app.services import storage
from app.services.audit import log_action
from app.services.file_validation import validate_upload

logger = logging.getLogger("certifix.documents")
router = APIRouter(prefix="/documents", tags=["Uploaded Documents & OCR"])

require_uploader = require_roles(UserRole.USER, UserRole.ADMIN)


def run_ocr(doc: UploadedDocument, data: bytes) -> None:
    """Run OCR + field extraction and store the results on the document row."""
    try:
        result = extract_text(data, doc.mime_type)
        doc.ocr_text = result.text[:100_000]
        doc.ocr_method = result.method
        doc.ocr_confidence = round(result.confidence, 2) if result.confidence is not None else None
        doc.ocr_fields = extract_fields(result.text)
        doc.ocr_status = OCRStatus.COMPLETED if result.text.strip() else OCRStatus.FAILED
        doc.ocr_error = None if result.text.strip() else "No readable text was found in the document."
    except OCRUnavailableError as exc:
        doc.ocr_status, doc.ocr_error, doc.ocr_fields = OCRStatus.FAILED, str(exc), {}
    except OCRError as exc:
        doc.ocr_status, doc.ocr_error, doc.ocr_fields = OCRStatus.FAILED, str(exc), {}
    except Exception:  # never leak internals; log for operators
        logger.exception("Unexpected OCR failure for document %s", doc.id)
        doc.ocr_status, doc.ocr_error, doc.ocr_fields = OCRStatus.FAILED, "Unexpected error while processing.", {}


def can_access_document(db: Session, user: User, doc: UploadedDocument) -> bool:
    if user.role == UserRole.ADMIN or doc.owner_id == user.id:
        return True
    if user.role == UserRole.ORGANIZATION and user.organization_id:
        return bool(db.scalar(select(func.count()).select_from(CorrectionRequest).where(
            CorrectionRequest.document_id == doc.id, CorrectionRequest.organization_id == user.organization_id)))
    return False


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(request: Request, file: UploadFile = File(...), user: User = Depends(require_uploader),
                          db: Session = Depends(get_db)):
    vf = await validate_upload(file)
    rel = storage.save_bytes("uploads", vf.data, vf.extension)
    doc = UploadedDocument(
        owner_id=user.id, original_filename=vf.filename, stored_path=rel, mime_type=vf.mime_type,
        size_bytes=len(vf.data), sha256=storage.sha256_hex(vf.data), ocr_status=OCRStatus.PENDING,
        delete_after=datetime.now(timezone.utc) + timedelta(days=get_settings().UPLOAD_RETENTION_DAYS),
    )
    db.add(doc)
    db.flush()
    run_ocr(doc, vf.data)
    log_action(db, "document.uploaded", user, "document", doc.id,
               {"filename": vf.filename, "size": len(vf.data), "ocr_status": doc.ocr_status.value}, request)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("", response_model=Page[DocumentBrief])
def list_documents(p: Pagination = Depends(), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(UploadedDocument).where(UploadedDocument.owner_id == user.id) \
        .order_by(UploadedDocument.created_at.desc())
    items, total = paginate(db, stmt, p)
    return Page(items=items, total=total, page=p.page, page_size=p.page_size)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.get(UploadedDocument, document_id)
    if not doc or not can_access_document(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}/file")
def get_document_file(document_id: int, request: Request, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    doc = db.get(UploadedDocument, document_id)
    if not doc or not can_access_document(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.stored_path:
        raise HTTPException(status_code=410, detail="The file was removed under the retention policy")
    try:
        data = storage.read_bytes(doc.stored_path)
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="File missing from storage")
    if doc.owner_id != user.id:
        log_action(db, "document.viewed", user, "document", doc.id, request=request)
        db.commit()
    return file_response(data, doc.mime_type, doc.original_filename)


@router.post("/{document_id}/reprocess", response_model=DocumentOut)
def reprocess_document(document_id: int, request: Request, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    doc = db.get(UploadedDocument, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.stored_path:
        raise HTTPException(status_code=410, detail="The file was removed under the retention policy")
    run_ocr(doc, storage.read_bytes(doc.stored_path))
    log_action(db, "document.reprocessed", user, "document", doc.id, {"ocr_status": doc.ocr_status.value}, request)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: int, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    doc = db.get(UploadedDocument, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    used = db.scalar(select(func.count()).select_from(CorrectionRequest)
                     .where(CorrectionRequest.document_id == doc.id))
    if used:
        raise HTTPException(status_code=409, detail="This document is attached to a correction request and is "
                                                    "kept as part of the correction record")
    path = doc.stored_path
    log_action(db, "document.deleted", user, "document", doc.id, {"filename": doc.original_filename}, request)
    db.delete(doc)
    db.commit()
    storage.delete(path)
