from __future__ import annotations
import os
import mimetypes
from pathlib import Path
from starlette.requests import Request
from starlette.responses import JSONResponse, FileResponse, Response
from user.auth import require_user

AVATAR_DIR = Path(__file__).parent.parent / "data" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_BYTES = 4 * 1024 * 1024  # 4 MB


def _avatar_path(uid: int) -> Path | None:
    for ext in (".jpg", ".png", ".webp", ".gif"):
        p = AVATAR_DIR / f"{uid}{ext}"
        if p.exists():
            return p
    return None


async def get_avatar(request: Request) -> Response:
    uid = int(request.path_params["uid"])
    path = _avatar_path(uid)
    if path is None:
        return Response(status_code=404)
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime, headers={
        "Cache-Control": "public, max-age=300",
    })


async def upload_avatar(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid: int = payload["uid"]

    form = await request.form()
    file = form.get("avatar")
    if file is None:
        return JSONResponse({"detail": "No file uploaded"}, status_code=400)

    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        return JSONResponse({"detail": "Unsupported image type"}, status_code=400)

    data = await file.read()
    if len(data) > MAX_BYTES:
        return JSONResponse({"detail": "File too large (max 4 MB)"}, status_code=400)

    # Remove any existing avatar for this user
    for ext in (".jpg", ".png", ".webp", ".gif"):
        old = AVATAR_DIR / f"{uid}{ext}"
        if old.exists():
            old.unlink()

    ext = {
        "image/jpeg": ".jpg",
        "image/png":  ".png",
        "image/webp": ".webp",
        "image/gif":  ".gif",
    }.get(content_type, ".jpg")

    dest = AVATAR_DIR / f"{uid}{ext}"
    dest.write_bytes(data)

    return JSONResponse({"url": f"/api/user/avatar/{uid}"})


async def delete_avatar(request: Request) -> JSONResponse:
    payload = await require_user(request)
    uid: int = payload["uid"]
    removed = False
    for ext in (".jpg", ".png", ".webp", ".gif"):
        p = AVATAR_DIR / f"{uid}{ext}"
        if p.exists():
            p.unlink()
            removed = True
    return JSONResponse({"ok": removed})
