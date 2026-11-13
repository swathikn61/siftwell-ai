"""
Test setup: run the API against a temporary SQLite database so tests never
touch your real PostgreSQL data.
"""

import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
# Never call the real Gemini API from tests: no key unless a test injects a fake client
os.environ["GEMINI_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)
