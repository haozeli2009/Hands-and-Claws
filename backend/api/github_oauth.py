"""
GitHub OAuth sign-in.

Flow:
  1. Browser hits /api/auth/github/start → 302 to github.com/login/oauth/authorize
     We stash a short-lived `state` in an HttpOnly cookie to mitigate CSRF.
  2. GitHub redirects back to /api/auth/github/callback?code=…&state=…
     We verify state, exchange code for an access token, fetch user + email,
     then find-or-create-or-link a Hands&Claws user and issue a JWT.
  3. We redirect to the frontend login page with the JWT in the URL fragment
     (hash fragments are not sent to servers and don't end up in access logs).
"""
from __future__ import annotations
import logging
import secrets
import urllib.parse
import httpx

from starlette.requests import Request
from starlette.responses import RedirectResponse, JSONResponse
from starlette.exceptions import HTTPException

from config import Config
from user.db import UserDB
from user.auth import create_token, unusable_password_hash

logger = logging.getLogger(__name__)

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL     = "https://github.com/login/oauth/access_token"
USER_URL      = "https://api.github.com/user"
EMAILS_URL    = "https://api.github.com/user/emails"

STATE_COOKIE   = "gh_oauth_state"
STATE_MAX_AGE  = 600  # 10 minutes
SCOPE          = "read:user user:email"


def _is_configured() -> bool:
    return bool(Config.GITHUB_CLIENT_ID
                and Config.GITHUB_CLIENT_SECRET
                and Config.GITHUB_REDIRECT_URI)


async def providers(request: Request) -> JSONResponse:
    """Tell the frontend which OAuth buttons to render."""
    return JSONResponse({"github": _is_configured()})


async def github_start(request: Request) -> RedirectResponse:
    if not _is_configured():
        raise HTTPException(503, "GitHub sign-in is not configured on this server.")
    state = secrets.token_urlsafe(24)
    qs = urllib.parse.urlencode({
        "client_id":    Config.GITHUB_CLIENT_ID,
        "redirect_uri": Config.GITHUB_REDIRECT_URI,
        "scope":        SCOPE,
        "state":        state,
        "allow_signup": "true",
    })
    resp = RedirectResponse(f"{AUTHORIZE_URL}?{qs}", status_code=302)
    resp.set_cookie(
        STATE_COOKIE, state,
        max_age=STATE_MAX_AGE, httponly=True, samesite="lax", path="/",
    )
    return resp


def _fail_redirect(reason: str) -> RedirectResponse:
    logger.warning("GitHub OAuth failed: %s", reason)
    qs = urllib.parse.urlencode({"error": reason})
    return RedirectResponse(f"/login?{qs}", status_code=302)


async def github_callback(request: Request) -> RedirectResponse:
    if not _is_configured():
        raise HTTPException(503, "GitHub sign-in is not configured on this server.")

    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        return _fail_redirect("missing_code_or_state")

    cookie_state = request.cookies.get(STATE_COOKIE)
    if not cookie_state or not secrets.compare_digest(cookie_state, state):
        return _fail_redirect("state_mismatch")

    async with httpx.AsyncClient(timeout=10) as http:
        token_resp = await http.post(
            TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id":     Config.GITHUB_CLIENT_ID,
                "client_secret": Config.GITHUB_CLIENT_SECRET,
                "code":          code,
                "redirect_uri":  Config.GITHUB_REDIRECT_URI,
            },
        )
        if token_resp.status_code != 200:
            return _fail_redirect("token_exchange_failed")
        access_token = token_resp.json().get("access_token")
        if not access_token:
            return _fail_redirect("no_access_token")

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept":        "application/vnd.github+json",
            "User-Agent":    "hands-and-claws-oauth",
        }
        user_resp = await http.get(USER_URL, headers=headers)
        if user_resp.status_code != 200:
            return _fail_redirect("user_fetch_failed")
        gh = user_resp.json()
        github_id = str(gh.get("id") or "")
        login     = (gh.get("login") or "").strip()
        email     = (gh.get("email") or "").strip().lower()

        if not github_id or not login:
            return _fail_redirect("bad_user_payload")

        # Primary email may be hidden on the public profile — fall back to /user/emails.
        if not email:
            em_resp = await http.get(EMAILS_URL, headers=headers)
            if em_resp.status_code == 200:
                for item in em_resp.json():
                    if item.get("primary") and item.get("verified"):
                        email = (item.get("email") or "").strip().lower()
                        break
                if not email:
                    for item in em_resp.json():
                        if item.get("verified"):
                            email = (item.get("email") or "").strip().lower()
                            break

    if not email:
        return _fail_redirect("no_verified_email")

    db: UserDB = request.app.state.user_db

    # 1) Already linked by github_id — update github_login in case it wasn't stored yet
    user = await db.get_by_github_id(github_id)
    if user is not None:
        await db.link_github(user.uid, github_id, login)

    # 2) Match by email → link github_id onto the existing account
    if user is None:
        matched = await db.get_by_email(email)
        if matched is not None:
            user, _hash = matched
            await db.link_github(user.uid, github_id, login)
            logger.info("Linked GitHub id=%s to existing uid=%d", github_id, user.uid)

    # 3) Fresh user
    if user is None:
        username = await _unique_username(db, login)
        try:
            uid = await db.insert_github_user(
                username, email, github_id, unusable_password_hash(), login,
            )
        except Exception:
            logger.exception("Failed to create GitHub user login=%s", login)
            return _fail_redirect("create_user_failed")
        logger.info("Created GitHub user uid=%d username=%s", uid, username)
        from user.db import UserRow
        user = UserRow(uid=uid, username=username, email=email)

    token = create_token(user.uid, user.username)
    fragment = urllib.parse.urlencode({
        "token":    token,
        "uid":      user.uid,
        "username": user.username,
    })
    resp = RedirectResponse(f"/login#{fragment}", status_code=302)
    resp.delete_cookie(STATE_COOKIE, path="/")
    return resp


async def _unique_username(db: UserDB, base: str) -> str:
    """Return `base`, or `base2`, `base3`, … until one is free."""
    import aiosqlite
    base = base or "user"
    async with aiosqlite.connect(db._path) as conn:
        for i in range(0, 100):
            candidate = base if i == 0 else f"{base}{i + 1}"
            async with conn.execute(
                "SELECT 1 FROM users WHERE username = ?", (candidate,),
            ) as cur:
                if await cur.fetchone() is None:
                    return candidate
    return f"{base}{secrets.token_hex(3)}"
