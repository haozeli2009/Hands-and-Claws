from __future__ import annotations
import logging
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException
from user.db import UserDB
from user.auth import (
    hash_password, verify_password, create_token, require_user,
    is_unusable_password,
)

logger = logging.getLogger(__name__)


async def register(request: Request) -> JSONResponse:
    body = await request.json()
    username = (body.get("username") or "").strip()
    email    = (body.get("email")    or "").strip().lower()
    password =  body.get("password") or ""
    if not username or not email or not password:
        raise HTTPException(400, "username, email and password are required")
    if len(password) < 8:
        raise HTTPException(400, "password must be at least 8 characters")
    db: UserDB = request.app.state.user_db
    try:
        uid = await db.insert_user(username, email, hash_password(password))
    except Exception:
        raise HTTPException(409, "username or email already taken")
    token = create_token(uid, username)
    logger.info("Registered uid=%d username=%s", uid, username)
    return JSONResponse({"token": token, "uid": uid, "username": username}, status_code=201)


async def login(request: Request) -> JSONResponse:
    body  = await request.json()
    email = (body.get("email") or "").strip().lower()
    pw    =  body.get("password") or ""
    db: UserDB = request.app.state.user_db
    result = await db.get_by_email(email)
    if result is None:
        raise HTTPException(401, "Invalid email or password")
    user, stored_hash = result
    if is_unusable_password(stored_hash):
        raise HTTPException(401, "This account uses GitHub sign-in.")
    if not verify_password(pw, stored_hash):
        raise HTTPException(401, "Invalid email or password")
    token = create_token(user.uid, user.username)
    logger.info("Login uid=%d", user.uid)
    return JSONResponse({"token": token, "uid": user.uid, "username": user.username})


async def me(request: Request) -> JSONResponse:
    payload = await require_user(request)
    return JSONResponse({"uid": payload["uid"], "username": payload["username"]})


async def get_profile(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid = payload["uid"]
    db: UserDB = request.app.state.user_db
    profile = await db.get_profile(uid)
    if profile is None:
        return JSONResponse({"uid": uid, "name": "", "bio": "", "skills": "",
                             "location": "", "availability": True, "updated_at": ""})
    return JSONResponse(profile.as_dict())


async def register_agent(request: Request) -> JSONResponse:
    body     = await request.json()
    username = (body.get("username") or "").strip()
    skills   = (body.get("skills")   or "").strip()
    bio      = (body.get("bio")      or "").strip()
    if not username:
        raise HTTPException(400, "username is required")
    db: UserDB = request.app.state.user_db
    try:
        uid, token = await db.insert_agent(username, skills=skills, bio=bio)
    except Exception:
        raise HTTPException(409, "username already taken")
    logger.info("Agent registered uid=%d username=%s", uid, username)
    return JSONResponse(
        {"uid": uid, "username": username,
         "openclaw_token": token, "participant_type": "agent"},
        status_code=201,
    )


async def update_profile(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid  = payload["uid"]
    body = await request.json()
    db: UserDB = request.app.state.user_db
    profile = await db.upsert_profile(
        uid=uid,
        name        = body.get("name"),
        bio         = body.get("bio"),
        skills      = body.get("skills"),
        location    = body.get("location"),
        availability= body.get("availability"),
    )
    logger.info("Profile updated uid=%d", uid)
    return JSONResponse(profile.as_dict())
