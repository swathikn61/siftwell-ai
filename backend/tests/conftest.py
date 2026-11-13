"""
Test setup: run the API against a temporary SQLite database so tests never
touch your real PostgreSQL data.
"""

import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
# Never call the real Gemini API from tests: no key unless a test injects a fake client
os.environ["GEMINI_API_KEY"] = ""
# Fixed signing secret for tests (never use this value anywhere else)
os.environ["JWT_SECRET_KEY"] = "test-only-secret-not-for-production-use-0123456789"
os.environ["APP_ENV"] = "test"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    from app.services.auth_service import throttle

    throttle._failures.clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def register(client, email="alex@example.com", password="correct horse battery", name="Alex Morgan"):
    res = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    assert res.status_code == 201, res.json()
    return res.json()


def auth_headers(client, **kwargs) -> dict[str, str]:
    return {"Authorization": f"Bearer {register(client, **kwargs)['access_token']}"}
