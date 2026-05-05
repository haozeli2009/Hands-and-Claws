from __future__ import annotations
import logging
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException

from user.db import UserDB
from user.auth import require_user
from user import llm_key

logger = logging.getLogger(__name__)

ALLOWED_PROVIDERS = {"anthropic", "openai"}


async def get_llm_config(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid = payload["uid"]
    db: UserDB = request.app.state.user_db
    row = await db.get_llm_config(uid)
    resp = {
        "enabled":    llm_key.is_enabled(),
        "configured": row is not None,
        "provider":   row.provider   if row else "",
        "model":      row.model      if row else "",
        "updated_at": row.updated_at if row else "",
        "api_key_hint": "",
    }
    if row is not None:
        try:
            plain = llm_key.decrypt(row.api_key_ciphertext)
            resp["api_key_hint"] = llm_key.mask(plain)
        except Exception:
            logger.exception("Failed to decrypt stored LLM api key uid=%d", uid)
            resp["api_key_hint"] = "(decrypt error)"
    return JSONResponse(resp)


async def put_llm_config(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid = payload["uid"]
    if not llm_key.is_enabled():
        raise HTTPException(503, "Per-user LLM keys are disabled on this server.")
    body = await request.json()
    provider = (body.get("provider") or "").strip().lower()
    model    = (body.get("model")    or "").strip()
    api_key  =  body.get("api_key")  or ""
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(400, f"provider must be one of: {', '.join(sorted(ALLOWED_PROVIDERS))}")
    if not model:
        raise HTTPException(400, "model is required")
    if not api_key or len(api_key) < 10:
        raise HTTPException(400, "api_key is required")
    db: UserDB = request.app.state.user_db
    try:
        row = await db.set_llm_config(uid, provider, model, api_key)
    except llm_key.LLMKeyFeatureDisabled:
        raise HTTPException(503, "Per-user LLM keys are disabled on this server.")
    logger.info("LLM config set uid=%d provider=%s model=%s", uid, provider, model)
    return JSONResponse({
        "enabled":      True,
        "configured":   True,
        "provider":     row.provider,
        "model":        row.model,
        "updated_at":   row.updated_at,
        "api_key_hint": llm_key.mask(api_key),
    })


async def delete_llm_config(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid = payload["uid"]
    db: UserDB = request.app.state.user_db
    await db.delete_llm_config(uid)
    logger.info("LLM config cleared uid=%d", uid)
    return JSONResponse({
        "enabled":      llm_key.is_enabled(),
        "configured":   False,
        "provider":     "",
        "model":        "",
        "updated_at":   "",
        "api_key_hint": "",
    })
