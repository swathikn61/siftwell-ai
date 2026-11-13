"""
Password hashing and login tokens.

Passwords
---------
Hashed with scrypt (Python standard library, memory-hard) and a random 16-byte
salt per password. Stored as  scrypt$<n>$<r>$<p>$<salt>$<hash>  so the cost can
be raised later without breaking existing hashes. Plain passwords are never
stored or logged.

Tokens
------
Signed JWTs (HS256) with the user id, an expiry time and the user's
`token_version`. Bumping `token_version` (password change, "log out everywhere")
invalidates every token issued before.
"""

import base64
import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings

logger = logging.getLogger("siftwell.auth")

SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN = 2**14, 8, 1, 32
ALGORITHM = "HS256"


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_DKLEN)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check. Returns False for any malformed hash instead of raising."""
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=_unb64(salt), n=int(n), r=int(r), p=int(p), dklen=len(_unb64(expected)))
        return hmac.compare_digest(digest, _unb64(expected))
    except (ValueError, TypeError):
        return False


# Used when an email isn't registered, so a login attempt takes the same time either way
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
_dev_secret: str | None = None


def _secret() -> str:
    """The signing secret. In development a random one is generated if none is set (tokens reset on restart)."""
    global _dev_secret
    if settings.jwt_secret_key and settings.jwt_secret_key.get_secret_value().strip():
        return settings.jwt_secret_key.get_secret_value()
    if settings.is_production:
        raise RuntimeError("JWT_SECRET_KEY must be set in production.")
    if _dev_secret is None:
        _dev_secret = secrets.token_urlsafe(48)
        logger.warning("JWT_SECRET_KEY isn’t set — using a temporary secret. Everyone is logged out when the server restarts.")
    return _dev_secret


def check_auth_config() -> None:
    """Fail fast at startup if production is missing a signing secret."""
    _secret()


def create_access_token(user_id: int, token_version: int) -> tuple[str, int]:
    """Return (token, expires_in_seconds)."""
    expires_in = settings.jwt_expire_minutes * 60
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "ver": token_version, "iat": now, "exp": now + timedelta(seconds=expires_in), "type": "access"}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM), expires_in


def decode_access_token(token: str) -> dict | None:
    """Return the payload, or None if the token is invalid, expired or tampered with."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM], options={"require": ["sub", "exp", "iat"]})
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload
