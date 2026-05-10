"""
GitHub Marketplace webhook handler.

GitHub sends signed POST requests here for purchase lifecycle events:
  - marketplace_purchase.purchased
  - marketplace_purchase.cancelled
  - marketplace_purchase.changed      (plan upgrade / downgrade)
  - marketplace_purchase.pending_change
  - marketplace_purchase.pending_change_cancelled

Signature verification uses HMAC-SHA256 with GITHUB_MARKETPLACE_WEBHOOK_SECRET.

Payload key fields:
  sender.id          — GitHub user ID (used to look up our user row)
  sender.login       — GitHub username (for logging)
  marketplace_purchase.plan.name  — plan name string from Marketplace listing
  previous_marketplace_purchase.plan.name — prior plan (on "changed" action)
"""
from __future__ import annotations
import hashlib
import hmac
import json
import logging
import secrets

from starlette.requests import Request
from starlette.responses import JSONResponse

from config import Config
from user.db import UserDB

logger = logging.getLogger(__name__)

FREE_PLAN = "free"


async def marketplace_webhook(request: Request) -> JSONResponse:
    secret = Config.GITHUB_MARKETPLACE_WEBHOOK_SECRET
    if not secret:
        logger.warning("marketplace_webhook: GITHUB_MARKETPLACE_WEBHOOK_SECRET not set")
        return JSONResponse({"error": "webhook not configured"}, status_code=503)

    sig_header = request.headers.get("X-Hub-Signature-256", "")
    body = await request.body()

    if sig_header.startswith("sha256="):
        mac = hmac.new(secret.encode(), body, hashlib.sha256)
        if not secrets.compare_digest(sig_header[7:], mac.hexdigest()):
            logger.warning("marketplace_webhook: invalid signature")
            return JSONResponse({"error": "invalid signature"}, status_code=401)
    else:
        logger.warning("marketplace_webhook: missing X-Hub-Signature-256")
        return JSONResponse({"error": "missing signature"}, status_code=401)

    event = request.headers.get("X-GitHub-Event", "")
    try:
        payload = json.loads(body)
    except Exception:
        return JSONResponse({"error": "bad json"}, status_code=400)

    action   = payload.get("action", "")
    purchase = payload.get("marketplace_purchase", {})
    sender   = payload.get("sender", {})
    github_id   = str(sender.get("id", ""))
    github_login = sender.get("login", "?")
    plan_name    = purchase.get("plan", {}).get("name", FREE_PLAN)

    logger.info("marketplace event=%s action=%s github=%s plan=%s",
                event, action, github_login, plan_name)

    if event != "marketplace_purchase":
        return JSONResponse({"ok": True})

    db: UserDB = request.app.state.user_db

    if action == "purchased":
        await _set_plan(db, github_id, github_login, plan_name)

    elif action == "cancelled":
        await _set_plan(db, github_id, github_login, FREE_PLAN)

    elif action in ("changed", "pending_change"):
        prev = payload.get("previous_marketplace_purchase", {}).get("plan", {}).get("name", "?")
        logger.info("plan change %s → %s for github=%s", prev, plan_name, github_login)
        await _set_plan(db, github_id, github_login, plan_name)

    return JSONResponse({"ok": True})


async def _set_plan(db: UserDB, github_id: str, github_login: str, plan: str) -> None:
    updated = await db.set_marketplace_plan(github_id, plan)
    if updated:
        logger.info("marketplace: set plan=%r for github=%s", plan, github_login)
    else:
        # User hasn't signed up yet — they purchased before creating an account.
        # The plan will be applied when they sign in via GitHub OAuth and their
        # github_id is linked to their new account.
        logger.warning(
            "marketplace: no local user for github_id=%s (%s) — plan=%r stored pending sign-up",
            github_id, github_login, plan,
        )
