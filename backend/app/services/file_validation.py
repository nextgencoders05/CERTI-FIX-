"""Upload validation: size, extension, magic bytes, and decodability."""
import io
from dataclasses import dataclass

import fitz  # PyMuPDF
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.config import get_settings

Image.MAX_IMAGE_PIXELS = 60_000_000  # guard against decompression bombs

DOCUMENT_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
}
LOGO_TYPES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}

MAGIC = {
    "application/pdf": [b"%PDF-"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/webp": [b"RIFF"],
    "image/tiff": [b"II*\x00", b"MM\x00*"],
}


@dataclass
class ValidatedFile:
    data: bytes
    extension: str
    mime_type: str
    filename: str


def _safe_filename(name: str | None) -> str:
    name = (name or "upload").replace("\\", "/").split("/")[-1]
    cleaned = "".join(c for c in name if c.isalnum() or c in "._- ")[:200].strip()
    return cleaned or "upload"


async def read_limited(file: UploadFile, max_bytes: int) -> bytes:
    chunks, total = [], 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail=f"File too large. Maximum size is "
                                                        f"{max_bytes // (1024 * 1024)} MB")
        chunks.append(chunk)
    return b"".join(chunks)


async def validate_upload(file: UploadFile, allowed: dict[str, str] | None = None,
                          max_bytes: int | None = None) -> ValidatedFile:
    settings = get_settings()
    allowed = allowed or DOCUMENT_TYPES
    max_bytes = max_bytes or settings.max_upload_bytes
    filename = _safe_filename(file.filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported file type. Allowed: {', '.join(sorted(allowed))}")
    mime = allowed[ext]

    data = await read_limited(file, max_bytes)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    if not any(data.startswith(sig) for sig in MAGIC[mime]):
        raise HTTPException(status_code=415, detail="File content does not match its extension")
    if mime == "image/webp" and data[8:12] != b"WEBP":
        raise HTTPException(status_code=415, detail="File content does not match its extension")

    if mime == "application/pdf":
        try:
            with fitz.open(stream=data, filetype="pdf") as doc:
                if doc.needs_pass:
                    raise HTTPException(status_code=400, detail="Password-protected PDFs are not supported")
                if doc.page_count == 0:
                    raise HTTPException(status_code=400, detail="PDF has no pages")
                if doc.page_count > settings.MAX_PDF_PAGES:
                    raise HTTPException(status_code=400,
                                        detail=f"PDF has too many pages (max {settings.MAX_PDF_PAGES})")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="The PDF file is corrupted or unreadable")
    else:
        try:
            with Image.open(io.BytesIO(data)) as img:
                img.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError):
            raise HTTPException(status_code=400, detail="The image file is corrupted or unreadable")

    return ValidatedFile(data=data, extension=ext, mime_type=mime, filename=filename)
