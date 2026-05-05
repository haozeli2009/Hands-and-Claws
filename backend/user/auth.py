from __future__ import annotations
import bcrypt
import secrets
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from starlette.exceptions import HTTPException
from starlette.requests import Request
from config import Config


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

# Users who sign up via OAuth have no password; we store this sentinel in
# hashed_password so every password-login attempt fails. The "!" prefix makes
# the string invalid as a bcrypt hash, so verify_password always returns False.
UNUSABLE_PASSWORD_PREFIX = "!oauth:"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def unusable_password_hash() -> str:
    return UNUSABLE_PASSWORD_PREFIX + secrets.token_urlsafe(16)


def is_unusable_password(hashed: str) -> bool:
    return hashed.startswith(UNUSABLE_PASSWORD_PREFIX)


def verify_password(plain: str, hashed: str) -> bool:
    if is_unusable_password(hashed):
        return False
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_token(uid: int, username: str) -> str:
    payload = {
        "uid":      uid,
        "username": username,
        "exp":      datetime.now(timezone.utc) + timedelta(days=Config.JWT_EXPIRY_DAYS),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    """Decode and return payload, or raise HTTPException 401."""
    try:
        return jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_uid_from_token(token: str) -> int:
    return decode_token(token)["uid"]


# ---------------------------------------------------------------------------
# Starlette dependency — extracts token from Authorization header or query param
# ---------------------------------------------------------------------------

async def require_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if token is None:
        token = request.query_params.get("token")
    if token is None:
        raise HTTPException(status_code=401, detail="Missing token")
    return decode_token(token)
