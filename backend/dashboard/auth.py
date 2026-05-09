import base64
import hashlib
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_COOKIE = "dash_session"


def _session_token(user: str, password: str) -> str:
    return hashlib.sha256(f"{user}:{password}".encode()).hexdigest()[:32]


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Protects /dashboard and /dashboard/* with HTTP Basic Auth + session cookie."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not (path == "/dashboard" or path.startswith("/dashboard/")):
            return await call_next(request)

        from config import Config
        expected = _session_token(Config.DASHBOARD_USER, Config.DASHBOARD_PASS)

        # Valid session cookie — skip re-auth
        if request.cookies.get(_COOKIE) == expected:
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if auth.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth[6:]).decode("utf-8", errors="replace")
                username, _, password = decoded.partition(":")
                if username == Config.DASHBOARD_USER and password == Config.DASHBOARD_PASS:
                    response = await call_next(request)
                    response.set_cookie(_COOKIE, expected,
                                        max_age=86400, httponly=True, samesite="strict")
                    return response
            except Exception:
                pass

        return Response(
            content="Unauthorized",
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="Admin Dashboard"'},
        )
