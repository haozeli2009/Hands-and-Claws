"""
GitHub App installation flow.

Flow:
  1. GET /api/github/app/start (authenticated) → 302 to GitHub App install page
     The user's uid is signed into the `state` param so we know who's coming back.
  2. GitHub redirects to /api/github/app/callback?installation_id=...&state=...
     We verify state, fetch repos, store installation.
  3. GET  /api/github/app/status  → {configured, connected, repos}
  4. POST /api/github/app/repos/refresh → re-fetch repo list from GitHub
  5. DEL  /api/github/app         → disconnect
  6. POST /api/github/action      → supply user posts a review/comment on demand user's repo
"""
from __future__ import annotations
import hashlib
import hmac
import json
import logging
import secrets
import urllib.parse

from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException

from config import Config
from github.client import (
    get_installation_token, get_installation_repos,
    post_pr_review, post_issue_comment,
)
from user.auth import require_user
from user.db import UserDB

logger = logging.getLogger(__name__)

_STATE_COOKIE  = "gh_app_state"
_STATE_MAX_AGE = 600  # 10 min


def _app_configured() -> bool:
    return bool(Config.GITHUB_APP_ID and Config.GITHUB_APP_NAME and Config.GITHUB_APP_PRIVATE_KEY)


def _make_state(uid: int) -> str:
    nonce = secrets.token_urlsafe(16)
    sig = hmac.new(
        Config.JWT_SECRET.encode(),
        f"{uid}:{nonce}".encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    return f"{uid}.{nonce}.{sig}"


def _verify_state(state: str) -> int | None:
    try:
        uid_str, nonce, sig = state.split(".")
    except ValueError:
        return None
    expected = hmac.new(
        Config.JWT_SECRET.encode(),
        f"{uid_str}:{nonce}".encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    if not secrets.compare_digest(sig, expected):
        return None
    try:
        return int(uid_str)
    except ValueError:
        return None


# ------------------------------------------------------------------
# Installation flow
# ------------------------------------------------------------------

async def github_app_start(request: Request) -> RedirectResponse:
    if not _app_configured():
        raise HTTPException(503, "GitHub App is not configured on this server.")
    payload = await require_user(request)
    uid = payload["uid"]
    state = _make_state(uid)
    install_url = (
        f"https://github.com/apps/{Config.GITHUB_APP_NAME}/installations/new"
        f"?state={urllib.parse.quote(state)}"
    )
    resp = JSONResponse({"url": install_url})
    resp.set_cookie(
        _STATE_COOKIE, state, max_age=_STATE_MAX_AGE,
        httponly=True, samesite="lax", path="/",
    )
    return resp


async def github_app_callback(request: Request) -> RedirectResponse:
    if not _app_configured():
        raise HTTPException(503, "GitHub App is not configured on this server.")

    installation_id = request.query_params.get("installation_id", "")
    state           = request.query_params.get("state", "")
    setup_action    = request.query_params.get("setup_action", "")

    if setup_action == "delete":
        uid = _verify_state(state)
        if uid:
            db: UserDB = request.app.state.user_db
            await db.delete_github_installation(uid)
        resp = RedirectResponse("/integrations", status_code=302)
        resp.delete_cookie(_STATE_COOKIE, path="/")
        return resp

    if not installation_id:
        return RedirectResponse("/integrations?error=missing_installation_id", status_code=302)

    # Prefer state from cookie (more reliable against CSRF than query param)
    cookie_state = request.cookies.get(_STATE_COOKIE, "")
    uid = _verify_state(cookie_state) or _verify_state(state)
    if uid is None:
        logger.warning("GitHub App callback: invalid or missing state")
        return RedirectResponse("/integrations?error=invalid_state", status_code=302)

    db: UserDB = request.app.state.user_db

    try:
        repos = await get_installation_repos(installation_id)
    except Exception:
        logger.exception("Failed to fetch repos installation_id=%s", installation_id)
        repos = []

    await db.upsert_github_installation(uid, installation_id, json.dumps(repos))
    logger.info("GitHub App connected uid=%d installation_id=%s repos=%d",
                uid, installation_id, len(repos))

    resp = RedirectResponse("/integrations?github_app=connected", status_code=302)
    resp.delete_cookie(_STATE_COOKIE, path="/")
    return resp


# ------------------------------------------------------------------
# Status / management
# ------------------------------------------------------------------

async def github_app_status(request: Request) -> JSONResponse:
    if not _app_configured():
        return JSONResponse({"configured": False, "connected": False, "repos": []})
    payload = await require_user(request)
    db: UserDB = request.app.state.user_db
    row = await db.get_github_installation(payload["uid"])
    if row is None:
        return JSONResponse({"configured": True, "connected": False, "repos": []})
    repos = json.loads(row.repos) if row.repos else []
    return JSONResponse({
        "configured":     True,
        "connected":      True,
        "installation_id": row.installation_id,
        "repos":          repos,
        "connected_at":   row.connected_at,
    })


async def github_app_repos_refresh(request: Request) -> JSONResponse:
    payload = await require_user(request)
    db: UserDB = request.app.state.user_db
    row = await db.get_github_installation(payload["uid"])
    if row is None:
        raise HTTPException(404, "No GitHub App installation found.")
    try:
        repos = await get_installation_repos(row.installation_id)
        await db.upsert_github_installation(payload["uid"], row.installation_id, json.dumps(repos))
        return JSONResponse({"repos": repos})
    except Exception:
        logger.exception("Failed to refresh repos uid=%d", payload["uid"])
        raise HTTPException(502, "Failed to fetch repos from GitHub.")


async def github_app_disconnect(request: Request) -> JSONResponse:
    payload = await require_user(request)
    db: UserDB = request.app.state.user_db
    await db.delete_github_installation(payload["uid"])
    return JSONResponse({"ok": True})


# ------------------------------------------------------------------
# Supply-side action
# ------------------------------------------------------------------

async def github_action(request: Request) -> JSONResponse:
    """
    A supply-side participant posts a GitHub action (review / comment) on the
    demand user's repo, using the demand user's GitHub App installation token.
    """
    supply_payload = await require_user(request)
    supply_uid = supply_payload["uid"]

    body        = await request.json()
    cid         = str(body.get("cid", "")).strip()
    action      = str(body.get("action", "")).strip()
    owner       = str(body.get("owner", "")).strip()
    repo        = str(body.get("repo", "")).strip()
    number      = int(body.get("number", 0))
    text        = str(body.get("body", "")).strip()
    event       = str(body.get("event", "COMMENT")).strip().upper()

    if not all([cid, action, owner, repo, number, text]):
        raise HTTPException(400, "cid, action, owner, repo, number, and body are required.")
    if event not in ("APPROVE", "REQUEST_CHANGES", "COMMENT"):
        event = "COMMENT"

    db: UserDB = request.app.state.user_db

    demand_uid = await db.get_demand_uid_for_cid(cid)
    if demand_uid is None:
        raise HTTPException(404, "Task not found.")

    installation = await db.get_github_installation(demand_uid)
    if installation is None:
        raise HTTPException(404, "Demand user has no GitHub App connected.")

    try:
        token, _ = await get_installation_token(installation.installation_id)
    except Exception:
        logger.exception("Failed to get installation token demand_uid=%d", demand_uid)
        raise HTTPException(502, "Failed to authenticate with GitHub.")

    try:
        if action == "post_pr_review":
            result = await post_pr_review(token, owner, repo, number, text, event)
        elif action == "post_issue_comment":
            result = await post_issue_comment(token, owner, repo, number, text)
        else:
            raise HTTPException(400, f"Unknown action: {action!r}")
    except HTTPException:
        raise
    except Exception:
        logger.exception("GitHub action failed supply_uid=%d cid=%s", supply_uid, cid)
        raise HTTPException(502, "GitHub API call failed.")

    logger.info("GitHub action=%s supply=%d demand=%d cid=%s %s/%s#%d",
                action, supply_uid, demand_uid, cid, owner, repo, number)
    return JSONResponse({"ok": True, **result})
