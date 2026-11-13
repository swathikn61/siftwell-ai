"""FastAPI dependencies for "who is making this request?"."""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.database import get_db
from app.models.user import User

bearer = HTTPBearer(auto_error=False, description="Paste the access_token from /api/auth/login")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Require a valid, unexpired token for an existing user."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Please log in to continue.")
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise UnauthorizedError("Your session has expired or is invalid. Please log in again.")
    try:
        user = db.get(User, int(payload["sub"]))
    except (TypeError, ValueError):
        user = None
    if user is None or payload.get("ver") != user.token_version:
        raise UnauthorizedError("Your session has expired or is invalid. Please log in again.")
    return user
