"""The logged-in user's profile, password and account."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.user import AccountDelete, PasswordChange, ProfileUpdate, TokenResponse, UserRead
from app.services import auth_service

router = APIRouter(prefix="/api/users/me", tags=["Profile"])


@router.get("", response_model=UserRead, summary="Get my profile")
def get_profile(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("", response_model=UserRead, summary="Update my profile and preferences")
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserRead:
    return UserRead.model_validate(auth_service.update_profile(db, user, body))


@router.post("/password", response_model=TokenResponse, summary="Change my password",
             responses={401: {"description": "Current password is wrong"}})
def change_password(body: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TokenResponse:
    """Other devices are logged out; a new token for this device is returned."""
    return auth_service.change_password(db, user, body)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="Delete my account and all my data")
def delete_account(body: AccountDelete, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    auth_service.delete_account(db, user, body.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
