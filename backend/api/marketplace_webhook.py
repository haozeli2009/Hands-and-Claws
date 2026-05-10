"""
GitHub Marketplace webhook handler.

GitHub sends signed POST requests here for purchase lifecycle events:
  - marketplace_purchase.purchased
  - marketplace_purchase.cancelled
  - marketplace_purchase.changed      (plan upgrade / downgrade)
  - marketplace_purchase.pending_change
  - marketplace_purchase.pending_change_cancelled

Signature verification uses HMAC-SHA256 with GITHUB_MARKETPLACE_WEBHOOK_SECRET.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import logging

from starlette.requests import Request
from starlette.responses import JSONResponse

from config import Config

logger = logging.getLogger(__name__)


async def _verify_signature(request: Request) -> bytes | None:
    """Return raw body if signature is valid, None otherwise."""
    sig_header = request.headers.get("X-Hub-Signature-256", "")
    if not sig_header.startswith("sha256="):
        return None
    expected = hmac.new(
        Config.GITHUB_MARKETPLACE_WEBHOOK_SECRET.encode(),
        digestmod=hashlib.sha256,
    )
    body = await request.body()
    expected.update(body)
    if not secrets.compare_digest(sig_header[7:], expected.hexdigest()):
        return None
    return body


async def marketplace_webhook(request: Request) -> JSONResponse:
    import secrets as _secrets  # local to avoid shadowing module-level

    secret = Config.GITHUB_MARKETPLACE_WEBHOOK_SECRET
    if not secret:
        logger.warning("marketplace_webhook: GITHUB_MARKETPLACE_WEBHOOK_SECRET not set — rejecting")
        return JSONResponse({"error": "webhook not configured"}, status_code=503)

    sig_header = request.headers.get("X-Hub-Signature-256", "")
    body = await request.body()

    if sig_header.startswith("sha256="):
        mac = hmac.new(secret.encode(), body, hashlib.sha256)
        if not _secrets.compare_digest(sig_header[7:], mac.hexdigest()):
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

    action = payload.get("action", "")
    purchase = payload.get("marketplace_purchase", {})
    account = payload.get("sender", {})

    logger.info(
        "marketplace_webhook event=%s action=%s account=%s plan=%s",
        event, action,
        account.get("login", "?"),
        purchase.get("plan", {}).get("name", "?"),
    )

    if event == "marketplace_purchase":
        if action == "purchased":
            _on_purchased(payload)
        elif action == "cancelled":
            _on_cancelled(payload)
        elif action in ("changed", "pending_change"):
            _on_changed(payload)

    return JSONResponse({"ok": True})


# ---------------------------------------------------------------------------
# Event handlers — extend these as billing logic is added
# ---------------------------------------------------------------------------

def _on_purchased(payload: dict) -> None:
    account = payload.get("sender", {})
    plan = payload.get("marketplace_purchase", {}).get("plan", {})
    logger.info("New Marketplace purchase: account=%s plan=%s",
                account.get("login"), plan.get("name"))
    # TODO: mark account as paid in DB / unlock plan features


def _on_cancelled(payload: dict) -> None:
    account = payload.get("sender", {})
    logger.info("Marketplace cancellation: account=%s", account.get("login"))
    # TODO: downgrade account to free tier


def _on_changed(payload: dict) -> None:
    account = payload.get("sender", {})
    prev = payload.get("previous_marketplace_purchase", {}).get("plan", {})
    curr = payload.get("marketplace_purchase", {}).get("plan", {})
    logger.info("Marketplace plan change: account=%s %s → %s",
                account.get("login"), prev.get("name"), curr.get("name"))
    # TODO: update plan entitlements in DB
