from conftest import auth, create_admin, create_template, register_org, register_user, verified_org


def test_user_cannot_access_admin_or_org_endpoints(client):
    token = register_user(client)
    assert client.get("/api/admin/stats", headers=auth(token)).status_code == 403
    assert client.get("/api/templates", headers=auth(token)).status_code == 403
    assert client.post("/api/certificates", json={"template_id": 1, "recipient_name": "X Y"},
                       headers=auth(token)).status_code == 403


def test_pending_org_cannot_issue_until_verified(client):
    admin = create_admin(client)
    org_token, org_id = register_org(client)
    r = client.post("/api/templates", json={"name": "T", "body_text": "has completed {course_or_role}."},
                    headers=auth(org_token))
    assert r.status_code == 403
    assert "pending" in r.json()["detail"]

    # Pending org can still view/update its own profile
    assert client.get("/api/organizations/me", headers=auth(org_token)).status_code == 200

    client.post(f"/api/admin/organizations/{org_id}/status", json={"status": "verified"}, headers=auth(admin))
    create_template(client, org_token)


def test_reject_requires_note_and_suspension_blocks(client):
    admin = create_admin(client)
    org_token, org_id = verified_org(client, admin)
    r = client.post(f"/api/admin/organizations/{org_id}/status", json={"status": "suspended"}, headers=auth(admin))
    assert r.status_code == 400
    r = client.post(f"/api/admin/organizations/{org_id}/status", json={"status": "suspended", "note": "Audit"},
                    headers=auth(admin))
    assert r.status_code == 200
    assert client.post("/api/templates", json={"name": "T", "body_text": "has completed it."},
                       headers=auth(org_token)).status_code == 403


def test_org_isolation(client):
    admin = create_admin(client)
    a_token, _ = verified_org(client, admin, email="a@a.example", org_name="Org A University")
    b_token, _ = verified_org(client, admin, email="b@b.example", org_name="Org B Academy")
    tpl = create_template(client, a_token)
    cert = client.post("/api/certificates", json={"template_id": tpl["id"], "recipient_name": "Sam Lee"},
                       headers=auth(a_token)).json()
    assert client.get(f"/api/certificates/{cert['id']}", headers=auth(b_token)).status_code == 404
    assert client.get(f"/api/templates/{tpl['id']}", headers=auth(b_token)).status_code == 404
    # B cannot issue with A's template
    r = client.post("/api/certificates", json={"template_id": tpl["id"], "recipient_name": "Sam Lee"},
                    headers=auth(b_token))
    assert r.status_code == 400


def test_admin_cannot_demote_self(client):
    admin = create_admin(client)
    me = client.get("/api/auth/me", headers=auth(admin)).json()
    r = client.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}, headers=auth(admin))
    assert r.status_code == 400
