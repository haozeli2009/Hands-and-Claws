from __future__ import annotations
import logging
from starlette.requests import Request
from starlette.responses import JSONResponse
from user.db import UserDB
from user.auth import require_user

logger = logging.getLogger(__name__)


async def get_openclaw_token(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid: int = payload["uid"]
    db: UserDB = request.app.state.user_db
    token = await db.get_openclaw_token(uid)
    return JSONResponse({"token": token})


async def rotate_openclaw_token(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid: int = payload["uid"]
    db: UserDB = request.app.state.user_db
    token = await db.rotate_openclaw_token(uid)
    logger.info("Openclaw token rotated uid=%d", uid)
    return JSONResponse({"token": token})


async def get_openclaw_status(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid: int = payload["uid"]
    manager = request.app.state.ws_manager
    return JSONResponse({"connected": manager.is_openclaw_connected(uid)})
