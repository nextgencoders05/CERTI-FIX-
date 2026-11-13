from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.session import SessionLocal
from app.models import UploadedDocument
from app.security.rate_limit import RateLimitMiddleware
from conftest import auth, create_admin, make_text_pdf, register_org, register_user


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_categories_crud(client):
    admin = create_admin(client)
    cats = client.get("/api/categories").json()
    assert len(cats) == 8 and any(c["name"] == "Internship Certificate" for c in cats)

    r = client.post("/api/categories", json={"name": "Volunteer Certificate"}, headers=auth(admin))
    assert r.status_code == 201
    cid = r.json()["id"]
    assert client.post("/api/categories", json={"name": "volunteer certificate"},
                       headers=auth(admin)).status_code == 409
    assert client.patch(f"/api/categories/{cid}", json={"is_active": False}, headers=auth(admin)).status_code == 200
    assert len(client.get("/api/categories").json()) == 8
    assert client.delete(f"/api/categories/{cid}", headers=auth(admin)).status_code == 204

    system_id = cats[0]["id"]
    assert client.delete(f"/api/categories/{system_id}", headers=auth(admin)).status_code == 400
    user = register_user(client)
    assert client.post("/api/categories", json={"name": "Hack"}, headers=auth(user)).status_code == 403


def test_admin_stats_and_lists(client):
    admin = create_admin(client)
    register_user(client)
    register_org(client)
    stats = client.get("/api/admin/stats", headers=auth(admin)).json()
    assert stats["users"] == 1 and stats["organizations_pending"] == 1
    users = client.get("/api/admin/users?role=user", headers=auth(admin)).json()
    assert users["total"] == 1
    orgs = client.get("/api/admin/organizations?status=pending", headers=auth(admin)).json()
    assert orgs["total"] == 1
    # admin was notified about the new organization
    assert client.get("/api/notifications", headers=auth(admin)).json()["unread"] == 1


def test_contact_flow(client):
    admin = create_admin(client)
    r = client.post("/api/contact", json={"name": "Visitor", "email": "v@example.com", "subject": "Question",
                                          "message": "How do I verify a certificate?"})
    assert r.status_code == 201
    msgs = client.get("/api/admin/contact-messages", headers=auth(admin)).json()
    assert msgs["total"] == 1
    mid = msgs["items"][0]["id"]
    assert client.post(f"/api/admin/contact-messages/{mid}/resolve", headers=auth(admin)).json()["is_resolved"]


def test_retention_purges_expired_unreferenced_documents(client):
    admin = create_admin(client)
    token = register_user(client)
    doc = client.post("/api/documents", files={"file": ("c.pdf", make_text_pdf(["Certificate of Completion",
                                                                                 "This is to certify that A B"]),
                                                        "application/pdf")}, headers=auth(token)).json()
    with SessionLocal() as db:
        d = db.get(UploadedDocument, doc["id"])
        d.delete_after = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    r = client.post("/api/admin/retention/run", headers=auth(admin)).json()
    assert r["deleted"] == 1
    assert client.get(f"/api/documents/{doc['id']}", headers=auth(token)).status_code == 404


def test_rate_limiter_blocks_excess_requests():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, general_per_minute=3, strict_per_minute=2)

    @app.get("/api/thing")
    def thing():
        return {"ok": True}

    @app.post("/api/auth/login")
    def login():
        return {"ok": True}

    c = TestClient(app)
    assert [c.get("/api/thing").status_code for _ in range(4)] == [200, 200, 200, 429]
    assert [c.post("/api/auth/login").status_code for _ in range(3)] == [200, 200, 429]
    assert "Retry-After" in c.post("/api/auth/login").headers


def test_unhandled_errors_are_safe(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}
