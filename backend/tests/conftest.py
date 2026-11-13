"""Test fixtures. Tests run against an isolated SQLite database and a temporary storage dir."""
import io
import os
import shutil
import tempfile

_TMP = tempfile.mkdtemp(prefix="certifix-test-")
os.environ.update({
    "ENVIRONMENT": "test",
    "DATABASE_URL": f"sqlite:///{os.path.join(_TMP, 'test.db')}",
    "STORAGE_DIR": os.path.join(_TMP, "storage"),
    "JWT_SECRET_KEY": "test-secret-key-that-is-long-enough-123456",
    "RATE_LIMIT_PER_MINUTE": "100000",
    "AUTH_RATE_LIMIT_PER_MINUTE": "100000",
    "PUBLIC_VERIFY_BASE_URL": "http://testserver/verify",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402

from app.database.session import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.security.passwords import hash_password  # noqa: E402
from app.services.bootstrap import seed_default_categories  # noqa: E402

PASSWORD = "Str0ngPassw0rd"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_default_categories(db)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)


# ---------- helpers ----------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def register_user(client, email="alice@example.com", name="Alice Smth"):
    r = client.post("/api/auth/register", json={"email": email, "full_name": name, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def register_org(client, email="hr@acme.example", org_name="Acme Institute of Technology"):
    r = client.post("/api/auth/register-organization", json={
        "email": email, "full_name": "Olivia Org", "password": PASSWORD,
        "organization_name": org_name, "organization_email": "contact@acme.example",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    return body["access_token"], body["user"]["organization_id"]


def create_admin(client, email="admin@certifix.example"):
    with SessionLocal() as db:
        db.add(User(email=email, full_name="Super Admin", hashed_password=hash_password(PASSWORD),
                    role=UserRole.ADMIN))
        db.commit()
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def verified_org(client, admin_token, **kw):
    token, org_id = register_org(client, **kw)
    r = client.post(f"/api/admin/organizations/{org_id}/status", json={"status": "verified"},
                    headers=auth(admin_token))
    assert r.status_code == 200, r.text
    return token, org_id


def create_template(client, org_token, **overrides):
    payload = {
        "name": "Course template",
        "title_text": "Certificate of Completion",
        "body_text": "has successfully completed {course_or_role} from {start_date} to {end_date}.",
        "layout": {"signatory_name": "Dr. Jane Head", "signatory_title": "Director"},
        **overrides,
    }
    r = client.post("/api/templates", json=payload, headers=auth(org_token))
    assert r.status_code == 201, r.text
    return r.json()


def make_text_pdf(lines: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 780
    for line in lines:
        c.drawString(60, y, line)
        y -= 22
    c.showPage()
    c.save()
    return buf.getvalue()
