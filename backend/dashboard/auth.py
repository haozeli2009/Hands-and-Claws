import base64
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Protects /dashboard and /dashboard/* with HTTP Basic Auth."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Only guard dashboard routes
        if not (path == "/dashboard" or path.startswith("/dashboard/")):
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if auth.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth[6:]).decode("utf-8", errors="replace")
                username, _, password = decoded.partition(":")
                from config import Config
                if username == Config.DASHBOARD_USER and password == Config.DASHBOARD_PASS:
                    return await call_next(request)
            except Exception:
                pass

        return Response(
            content="Unauthorized",
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="Admin Dashboard"'},
        )
