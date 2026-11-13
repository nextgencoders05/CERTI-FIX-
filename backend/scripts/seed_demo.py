"""Seed demo data for local development: one verified organization with a template and an
issued certificate, one public user (the certificate recipient), and one admin.

Usage (from backend/, after `alembic upgrade head`):
    python -m scripts.seed_demo

All demo accounts share the password in DEMO_PASSWORD; if unset, a random one is generated
and printed once. Never run this against a production database.
"""
import os
import secrets
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.config import get_settings
from app.database.session import SessionLocal
from app.models import CertificateCategory, CertificateTemplate, Organization, OrganizationStatus, User, UserRole
from app.security.passwords import hash_password
from app.services.bootstrap import seed_default_categories
from app.services.certificate_service import IssueData, issue_certificate

ACCOUNTS = {
    "admin": "admin@example.com",
    "org": "registrar@example.com",
    "user": "student@example.com",
}


def main() -> None:
    if get_settings().ENVIRONMENT == "production":
        raise SystemExit("Refusing to seed demo data in production.")
    password = os.environ.get("DEMO_PASSWORD") or f"Demo-{secrets.token_urlsafe(9)}1"
    with SessionLocal() as db:
        seed_default_categories(db)
        if db.scalar(select(User).where(User.email == ACCOUNTS["admin"])):
            print("Demo data already present; nothing to do.")
            return
        pw = hash_password(password)
        admin = User(email=ACCOUNTS["admin"], full_name="Demo Admin", hashed_password=pw, role=UserRole.ADMIN)
        db.add(admin)
        db.flush()
        org = Organization(name="Demo Institute of Technology", slug="demo-institute-of-technology",
                           email="contact@example.org", website="https://example.org",
                           registration_number="REG-0001", status=OrganizationStatus.VERIFIED,
                           verified_at=datetime.now(timezone.utc), verified_by_id=admin.id,
                           description="Demo issuing organization.")
        db.add(org)
        db.flush()
        registrar = User(email=ACCOUNTS["org"], full_name="Riley Registrar", hashed_password=pw,
                         role=UserRole.ORGANIZATION, organization_id=org.id)
        student = User(email=ACCOUNTS["user"], full_name="Sam Student", hashed_password=pw, role=UserRole.USER)
        db.add_all([registrar, student])
        db.flush()
        category = db.scalar(select(CertificateCategory).where(CertificateCategory.slug == "internship-certificate"))
        tpl = CertificateTemplate(
            organization_id=org.id, category_id=category.id if category else None, name="Internship 2026",
            title_text="Certificate of Internship",
            body_text="has successfully completed an internship as {course_or_role} from {start_date} to {end_date}.",
            layout={"orientation": "landscape", "primary_color": "#1E3A8A", "accent_color": "#7C3AED",
                    "border_style": "double", "font": "Helvetica", "show_logo": True, "show_qr": True,
                    "signatory_name": "Dr. Dana Director", "signatory_title": "Head of Programmes"},
        )
        db.add(tpl)
        db.flush()
        cert = issue_certificate(db, org=org, template=tpl, issuer=registrar, data=IssueData(
            recipient_name="Sam Studnet", recipient_email=student.email, recipient_user_id=student.id,
            title=tpl.title_text, course_or_role="Software Engineering Intern", issue_date=date(2026, 9, 1),
            start_date=date(2026, 6, 1), end_date=date(2026, 8, 31), category_id=tpl.category_id))
        db.commit()
        print("Demo data created (the certificate intentionally misspells the recipient's name).")
        print(f"  Certificate: {cert.certificate_number}")
        for role, email in ACCOUNTS.items():
            print(f"  {role:<5} {email}")
        if not os.environ.get("DEMO_PASSWORD"):
            print(f"  Password for all demo accounts: {password}")


if __name__ == "__main__":
    main()
