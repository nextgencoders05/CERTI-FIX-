"""Password hashing with bcrypt (salted, adaptive cost)."""
import bcrypt

_BCRYPT_MAX_BYTES = 72


def _prepare(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes; reject silently-truncated input at the schema layer.
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(password), hashed.encode("utf-8"))
    except ValueError:
        return False
