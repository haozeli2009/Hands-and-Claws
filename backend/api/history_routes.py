from __future__ import annotations
import json
import logging
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException
from user.db import UserDB
from user.auth import require_user

logger = logging.getLogger(__name__)


async def get_history(request: Request) -> JSONResponse:
    uid = (await require_user(request))["uid"]
    db: UserDB = request.app.state.user_db
    messages   = await db.get_messages(uid)
    tasks      = await db.get_task_cards(uid)
    return JSONResponse({"messages": messages, "tasks": tasks})


async def save_message(request: Request) -> JSONResponse:
    uid  = (await require_user(request))["uid"]
    body = await request.json()
    msg_id = body.get("id")
    role   = body.get("role")
    text   = body.get("text", "")
    ts     = body.get("ts")
    cid    = body.get("cid", "") or ""
    if not msg_id or not role or not ts:
        raise HTTPException(400, "id, role and ts are required")
    db: UserDB = request.app.state.user_db
    await db.save_message(uid, msg_id, role, text, ts, cid)
    return JSONResponse({"ok": True})


async def delete_orphan_messages(request: Request) -> JSONResponse:
    uid = (await require_user(request))["uid"]
    db: UserDB = request.app.state.user_db
    deleted = await db.delete_orphan_messages(uid)
    return JSONResponse({"ok": True, "deleted": deleted})


async def save_task(request: Request) -> JSONResponse:
    uid  = (await require_user(request))["uid"]
    body = await request.json()
    card_id = body.get("card_id")
    if not card_id:
        raise HTTPException(400, "card_id is required")
    db: UserDB = request.app.state.user_db
    await db.save_task_card(uid, card_id, json.dumps(body))
    return JSONResponse({"ok": True})


async def delete_task(request: Request) -> JSONResponse:
    uid     = (await require_user(request))["uid"]
    card_id = request.path_params["card_id"]
    db: UserDB = request.app.state.user_db
    await db.delete_task_card(uid, card_id)
    return JSONResponse({"ok": True})
