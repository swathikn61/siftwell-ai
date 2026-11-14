"""Tests for registration, login, tokens, profile, password change and account deletion."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core import security
from app.core.config import settings
from tests.conftest import auth_headers, register

PASSWORD = "correct horse battery"


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
def test_passwords_are_hashed_with_scrypt_and_salted():
    a, b = security.hash_password(PASSWORD), security.hash_password(PASSWORD)
    assert a.startswith("scrypt$") and PASSWORD not in a
    assert a != b  # different salt each time
    assert security.verify_password(PASSWORD, a) and security.verify_password(PASSWORD, b)
    assert not security.verify_password("wrong password", a)


@pytest.mark.parametrize("bad", ["", "not-a-hash", "bcrypt$x$y", "scrypt$1$2$3$!!$??"])
def test_malformed_hashes_never_verify(bad):
    assert security.verify_password(PASSWORD, bad) is False


def test_password_is_never_stored_or_returned(client):
    body = register(client)
    assert "password" not in str(body).lower().replace("password_hash", "")
    from app.database import SessionLocal
    from app.models.user import User

    with SessionLocal() as db:
        user = db.query(User).one()
        assert user.password_hash.startswith("scrypt$") and PASSWORD not in user.password_hash


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------
def test_register_returns_token_and_user(client):
    body = register(client, email="Alex@Example.COM ")
    assert body["token_type"] == "bearer" and body["expires_in"] == settings.jwt_expire_minutes * 60
    assert body["user"]["email"] == "alex@example.com"  # normalised
    assert body["user"]["preferences"]["budget_max"] == 150000  # defaults


def test_duplicate_email_rejected_case_insensitively(client):
    register(client, email="alex@example.com")
    res = client.post("/api/auth/register", json={"name": "Other", "email": "ALEX@example.com", "password": PASSWORD})
    assert res.status_code == 409 and res.json()["error"]["code"] == "conflict"


@pytest.mark.parametrize("body, field", [
    ({"name": "Al", "email": "not-an-email", "password": PASSWORD}, "email"),
    ({"name": "Al", "email": "a@b.com", "password": "short"}, "password"),
    ({"name": "Al", "email": "a@b.com", "password": " padded password "}, "password"),
    ({"name": "A", "email": "a@b.com", "password": PASSWORD}, "name"),
    ({"name": "Al", "email": "a@b.com", "password": "x" * 129}, "password"),
])
def test_register_validation(client, body, field):
    res = client.post("/api/auth/register", json=body)
    assert res.status_code == 422
    assert field in {d["field"] for d in res.json()["error"]["details"]}


# ---------------------------------------------------------------------------
# Login and tokens
# ---------------------------------------------------------------------------
def test_login_success_is_case_insensitive(client):
    register(client)
    res = client.post("/api/auth/login", json={"email": "ALEX@example.com", "password": PASSWORD})
    assert res.status_code == 200 and res.json()["user"]["name"] == "Alex Morgan"


def test_wrong_password_and_unknown_email_look_the_same(client):
    register(client)
    wrong = client.post("/api/auth/login", json={"email": "alex@example.com", "password": "wrong password"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


def test_login_is_throttled_after_repeated_failures(client):
    register(client)
    for _ in range(settings.login_max_failures):
        assert client.post("/api/auth/login", json={"email": "alex@example.com", "password": "nope-nope"}).status_code == 401
    blocked = client.post("/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD})
    assert blocked.status_code == 429  # even the right password is blocked during the lockout
    assert blocked.json()["error"]["details"]["retry_after_seconds"] > 0


def test_protected_endpoints_require_a_token(client):
    for method, path in [("get", "/api/auth/me"), ("get", "/api/me/comparisons"), ("get", "/api/me/favourites"),
                         ("get", "/api/me/history"), ("patch", "/api/users/me"), ("post", "/api/auth/logout-all")]:
        res = getattr(client, method)(path)
        assert res.status_code == 401, path
        assert res.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("token", ["garbage", "a.b.c", ""])
def test_invalid_tokens_rejected(client, token):
    register(client)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def _forge(payload: dict, secret: str | None = None) -> str:
    return jwt.encode(payload, secret or settings.jwt_secret_key.get_secret_value(), algorithm="HS256")


def test_expired_tampered_and_wrong_secret_tokens_rejected(client):
    user_id = register(client)["user"]["id"]
    now = datetime.now(UTC)
    expired = _forge({"sub": str(user_id), "ver": 0, "type": "access", "iat": now - timedelta(hours=2), "exp": now - timedelta(hours=1)})
    wrong_secret = _forge({"sub": str(user_id), "ver": 0, "type": "access", "iat": now, "exp": now + timedelta(hours=1)}, secret="attacker-secret-xxxxxxxxxxxxxxxxxxxxxxxx")
    wrong_type = _forge({"sub": str(user_id), "ver": 0, "type": "refresh", "iat": now, "exp": now + timedelta(hours=1)})
    other_user = _forge({"sub": "999", "ver": 0, "type": "access", "iat": now, "exp": now + timedelta(hours=1)})
    for token in (expired, wrong_secret, wrong_type, other_user):
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_none_algorithm_token_rejected(client):
    user_id = register(client)["user"]["id"]
    unsigned = jwt.encode({"sub": str(user_id), "ver": 0, "type": "access", "iat": datetime.now(UTC),
                           "exp": datetime.now(UTC) + timedelta(hours=1)}, key=None, algorithm="none")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_logout_all_invalidates_existing_tokens(client):
    headers = auth_headers(client)
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 200  # stateless: client discards it
    assert client.post("/api/auth/logout-all", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401


# ---------------------------------------------------------------------------
# Profile, password, deletion
# ---------------------------------------------------------------------------
def test_update_profile_and_preferences(client):
    headers = auth_headers(client)
    res = client.patch("/api/users/me", headers=headers, json={
        "name": "  Alex   M ", "location": "Pune", "currency": "USD",
        "preferences": {"budget_min": 20000, "budget_max": 90000, "categories": ["laptops"], "priorities": ["Battery life", "Battery life"]},
    })
    assert res.status_code == 200
    user = res.json()
    assert (user["name"], user["location"], user["currency"]) == ("Alex M", "Pune", "USD")
    assert user["preferences"]["categories"] == ["laptops"] and user["preferences"]["priorities"] == ["Battery life"]
    assert client.get("/api/users/me", headers=headers).json()["preferences"]["budget_max"] == 90000


@pytest.mark.parametrize("body", [
    {"currency": "BTC"},
    {"name": "A"},
    {"preferences": {"budget_min": 90000, "budget_max": 10000}},
    {"preferences": {"categories": ["tablets"]}},
    {"email": "new@example.com", "name": "x"},  # email can't be changed here; extra field ignored but name invalid
])
def test_profile_validation(client, body):
    assert client.patch("/api/users/me", headers=auth_headers(client), json=body).status_code == 422


def test_change_password(client):
    old_headers = auth_headers(client)
    res = client.post("/api/users/me/password", headers=old_headers, json={"current_password": PASSWORD, "new_password": "a brand new passphrase"})
    assert res.status_code == 200
    new_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=new_headers).status_code == 200
    assert client.get("/api/auth/me", headers=old_headers).status_code == 401  # other sessions logged out
    assert client.post("/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "alex@example.com", "password": "a brand new passphrase"}).status_code == 200


def test_change_password_requires_current_password(client):
    headers = auth_headers(client)
    res = client.post("/api/users/me/password", headers=headers, json={"current_password": "wrong one", "new_password": "a brand new passphrase"})
    # 400, not 401: the session is still valid, so clients must not log the user out
    assert res.status_code == 400 and res.json()["error"]["code"] == "wrong_password"
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_delete_account_removes_user_and_data(client):
    headers = auth_headers(client)
    client.post("/api/me/history", headers=headers, json={"query": "laptop"})
    wrong = client.request("DELETE", "/api/users/me", headers=headers, json={"password": "wrong"})
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "wrong_password"
    assert client.request("DELETE", "/api/users/me", headers=headers, json={"password": PASSWORD}).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.post("/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}).status_code == 401
    from app.database import SessionLocal
    from app.models.user_data import SearchHistoryEntry

    with SessionLocal() as db:
        assert db.query(SearchHistoryEntry).count() == 0


def test_production_requires_jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "jwt_secret_key", None)
    monkeypatch.setattr(security, "_dev_secret", None)
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        security.check_auth_config()
