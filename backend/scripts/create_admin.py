"""Create (or promote) a super admin account.

Usage (from the backend/ directory, after `alembic upgrade head`):
    python -m scripts.create_admin --email admin@example.com --name "Super Admin"

The password is read from the ADMIN_PASSWORD environment variable, or prompted for.
"""
import argparse
import getpass
import os
import sys

from sqlalchemy import func, select

from app.database.session import SessionLocal
from app.models import User, UserRole
from app.schemas.auth import _validate_password_strength
from app.security.passwords import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a CertiFix AI super admin")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Super Admin")
    args = parser.parse_args()

    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    try:
        _validate_password_strength(password)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.email) == args.email.lower()))
        if user:
            user.role = UserRole.ADMIN
            user.organization_id = None
            user.is_active = True
            user.hashed_password = hash_password(password)
            print(f"Updated existing user {args.email} to super admin.")
        else:
            db.add(User(email=args.email.lower(), full_name=args.name, hashed_password=hash_password(password),
                        role=UserRole.ADMIN))
            print(f"Created super admin {args.email}.")
        db.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
