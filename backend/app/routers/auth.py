"""Registration, login and logout."""

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, RegisterRequest, TokenResponse, UserRead
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED, summary="Create an account",
             responses={409: {"description": "Email already registered"}})
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Creates the account and returns a login token straight away. Passwords are hashed with scrypt."""
    return auth_service.register(db, body)


@router.post("/login", response_model=TokenResponse, summary="Log in",
             responses={401: {"description": "Wrong email or password"}, 429: {"description": "Too many failed attempts"}})
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    """Returns a bearer token. Send it as `Authorization: Bearer <token>` on protected endpoints."""
    return auth_service.login(db, body, request.client.host if request.client else "unknown")


@router.get("/me", response_model=UserRead, summary="The logged-in user")
def me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Log out (this device)")
def logout(_: User = Depends(get_current_user)) -> Response:
    """Tokens are stateless: the client deletes its token. Use /logout-all to invalidate every token."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT, summary="Log out on every device")
def logout_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    auth_service.logout_everywhere(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
