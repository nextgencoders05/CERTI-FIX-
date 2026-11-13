import re
import secrets
import unicodedata
from datetime import datetime, timezone

# Unambiguous alphabet (no 0/O, 1/I/L)
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _random_code(length: int) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def new_certificate_number() -> str:
    return f"CFX-{datetime.now(timezone.utc).year}-{_random_code(8)}"


def new_correction_reference() -> str:
    return f"CR-{datetime.now(timezone.utc).strftime('%y%m')}-{_random_code(6)}"


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^\w\s-]", "", value).strip().lower()
    return re.sub(r"[-\s_]+", "-", value)[:200] or "item"
