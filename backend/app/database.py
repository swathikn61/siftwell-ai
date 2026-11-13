"""
Database setup with SQLAlchemy.

- `engine`       : the connection pool to PostgreSQL
- `SessionLocal` : a factory that creates database sessions
- `Base`         : the parent class for every database model
- `get_db`       : a FastAPI dependency that gives each request its own session
"""

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,  # check a connection is alive before using it
    echo=False,          # set to True to print every SQL query (handy when learning)
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """All models inherit from this class."""


def get_db() -> Generator[Session, None, None]:
    """Open a session for one request and always close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> bool:
    """Run a tiny query to confirm the database is reachable."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True


def create_tables() -> None:
    """
    Create any tables that don't exist yet.

    This is fine while learning. For a production app, switch to migrations
    with Alembic so schema changes are tracked and reversible.
    """
    # Import models so they register themselves on Base.metadata
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
