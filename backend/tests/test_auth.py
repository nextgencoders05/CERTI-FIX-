from conftest import PASSWORD, auth, create_admin, register_user


def test_register_login_and_me(client):
    token = register_user(client)
    me = client.get("/api/auth/me", headers=auth(token))
    assert me.status_code == 200
    assert me.json()["email"] == "alice@example.com"
    assert me.json()["role"] == "user"

    login = client.post("/api/auth/login", json={"email": "ALICE@example.com", "password": PASSWORD})
    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"


def test_duplicate_email_rejected(client):
    register_user(client)
    r = client.post("/api/auth/register", json={"email": "alice@example.com", "full_name": "Other",
                                                "password": PASSWORD})
    assert r.status_code == 409


def test_wrong_password_and_unknown_email(client):
    register_user(client)
    assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": "nope12345"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ghost@example.com", "password": PASSWORD}).status_code == 401


def test_weak_password_rejected(client):
    r = client.post("/api/auth/register", json={"email": "b@example.com", "full_name": "Bob", "password": "short"})
    assert r.status_code == 422
    assert "at least 8" in r.json()["detail"]


def test_protected_routes_require_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth("garbage.token.value")).status_code == 401


def test_password_is_hashed_and_change_password(client):
    from app.database.session import SessionLocal
    from app.models import User

    token = register_user(client)
    with SessionLocal() as db:
        stored = db.query(User).filter_by(email="alice@example.com").one().hashed_password
    assert stored != PASSWORD and stored.startswith("$2")

    r = client.post("/api/auth/change-password", headers=auth(token),
                    json={"current_password": PASSWORD, "new_password": "N3wPassword99"})
    assert r.status_code == 204
    assert client.post("/api/auth/login", json={"email": "alice@example.com",
                                                "password": "N3wPassword99"}).status_code == 200


def test_deactivated_user_blocked(client):
    admin = create_admin(client)
    token = register_user(client)
    uid = client.get("/api/auth/me", headers=auth(token)).json()["id"]
    r = client.patch(f"/api/admin/users/{uid}", json={"is_active": False}, headers=auth(admin))
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=auth(token)).status_code == 401
    assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD}).status_code == 403


def test_profile_update(client):
    token = register_user(client)
    r = client.put("/api/auth/me", json={"full_name": "Alice Smith", "phone": "+1 555 0100"}, headers=auth(token))
    assert r.status_code == 200
    assert r.json()["full_name"] == "Alice Smith"
