"""Account logic: register, log in (with brute-force throttling), profile, password and deletion."""

import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, RateLimitedError, UnauthorizedError
from app.core.security import DUMMY_HASH, create_access_token, hash_password, verify_password
from app.models.user import User
from app.models.user_data import Favourite, SavedComparison, SearchHistoryEntry
from app.schemas.user import LoginRequest, PasswordChange, ProfileUpdate, RegisterRequest, TokenResponse, UserPreferences, UserRead

BAD_LOGIN = "Email or password is incorrect."  # same message whether or not the email exists


class LoginThrottle:
    """
    Blocks an email+IP pair after too many failed logins within a time window.
    In-memory, so it applies per server process (fine for a single instance;
    use a shared store such as Redis if you run several).
    """

    def __init__(self) -> None:
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        window = settings.login_lockout_minutes * 60
        q = self._failures[key]
        while q and now - q[0] > window:
            q.popleft()
        return q

    def check(self, key: str) -> None:
        with self._lock:
            q = self._recent(key, time.monotonic())
            if len(q) >= settings.login_max_failures:
                wait = int(settings.login_lockout_minutes * 60 - (time.monotonic() - q[0])) + 1
                raise RateLimitedError(
                    f"Too many failed login attempts. Try again in about {max(1, wait // 60)} minute(s).",
                    details={"retry_after_seconds": wait},
                )

    def failed(self, key: str) -> None:
        with self._lock:
            self._recent(key, time.monotonic()).append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


throttle = LoginThrottle()


def token_response(user: User) -> TokenResponse:
    token, expires_in = create_access_token(user.id, user.token_version)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserRead.model_validate(user))


def register(db: Session, data: RegisterRequest) -> TokenResponse:
    if db.scalar(select(User.id).where(User.email == data.email)) is not None:
        raise ConflictError("An account with this email already exists. Try logging in instead.")
    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        preferences=UserPreferences().model_dump(),
        last_login_at=datetime.now(UTC),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two sign-ups with the same email at once
        db.rollback()
        raise ConflictError("An account with this email already exists. Try logging in instead.")
    db.refresh(user)
    return token_response(user)


def login(db: Session, data: LoginRequest, client_ip: str) -> TokenResponse:
    key = f"{data.email}|{client_ip}"
    throttle.check(key)
    user = db.scalar(select(User).where(User.email == data.email))
    # Always run one hash check so response time doesn't reveal whether the email exists
    ok = verify_password(data.password, user.password_hash if user else DUMMY_HASH) and user is not None
    if not ok:
        throttle.failed(key)
        raise UnauthorizedError(BAD_LOGIN)
    throttle.reset(key)
    user.last_login_at = datetime.now(UTC)
    db.commit()
    db.refresh(user)
    return token_response(user)


def logout_everywhere(db: Session, user: User) -> None:
    user.token_version += 1
    db.commit()


def update_profile(db: Session, user: User, data: ProfileUpdate) -> User:
    changes = data.model_dump(exclude_unset=True)
    if "preferences" in changes and data.preferences is not None:
        changes["preferences"] = data.preferences.model_dump()
    for field, value in changes.items():
        if value is not None:
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, data: PasswordChange) -> TokenResponse:
    if not verify_password(data.current_password, user.password_hash):
        raise UnauthorizedError("Your current password is incorrect.")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1  # log out other devices
    db.commit()
    db.refresh(user)
    return token_response(user)  # keep this device logged in


def delete_account(db: Session, user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError("Password is incorrect.")
    # Delete owned rows explicitly (works even where the database doesn't enforce ON DELETE CASCADE)
    for model in (SavedComparison, Favourite, SearchHistoryEntry):
        db.execute(delete(model).where(model.user_id == user.id))
    db.delete(user)
    db.commit()
