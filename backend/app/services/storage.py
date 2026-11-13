"""Private file storage.

Files are written under STORAGE_DIR with random names and are only ever streamed back
through authenticated API endpoints after a permission check. The directory is never
mounted as static content.
"""
import hashlib
import os
import uuid
from pathlib import Path

from app.config import get_settings

SUBDIRS = ("uploads", "certificates", "logos")


def storage_root() -> Path:
    root = get_settings().storage_path
    for sub in SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)
    return root


def save_bytes(subdir: str, data: bytes, extension: str) -> str:
    """Save bytes and return the path relative to the storage root."""
    if subdir not in SUBDIRS:
        raise ValueError("Invalid storage area")
    ext = extension.lower().lstrip(".")
    name = f"{uuid.uuid4().hex}.{ext}"
    rel = f"{subdir}/{name}"
    path = storage_root() / rel
    with open(path, "wb") as fh:
        fh.write(data)
    try:
        os.chmod(path, 0o600)
    except OSError:  # pragma: no cover - not supported on some filesystems
        pass
    return rel


def resolve(rel_path: str) -> Path:
    """Resolve a stored relative path safely (prevents path traversal)."""
    root = storage_root()
    full = (root / rel_path).resolve()
    if root not in full.parents:
        raise ValueError("Invalid storage path")
    return full


def read_bytes(rel_path: str) -> bytes:
    return resolve(rel_path).read_bytes()


def delete(rel_path: str | None) -> None:
    if not rel_path:
        return
    try:
        resolve(rel_path).unlink(missing_ok=True)
    except ValueError:
        pass


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
