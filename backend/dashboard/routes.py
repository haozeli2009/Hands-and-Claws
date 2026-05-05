from __future__ import annotations
import asyncio
import json
import logging

import aiosqlite
from starlette.requests import Request
from starlette.responses import HTMLResponse, StreamingResponse
from starlette.templating import Jinja2Templates
import os

from config import Config

_here = os.path.dirname(__file__)
templates = Jinja2Templates(directory=os.path.join(_here, "templates"))
logger = logging.getLogger(__name__)


async def activity(request: Request) -> HTMLResponse:
    handler = request.app.state.handler
    ws_mgr  = request.app.state.ws_manager
    tracker = request.app.state.tracker
    data    = tracker.get_activity(handler.pending_count(), ws_mgr.count())
    return templates.TemplateResponse(
        request, "activity.html", {"data": data}
    )


async def stats(request: Request) -> HTMLResponse:
    tracker = request.app.state.tracker
    rows    = tracker.get_user_stats()
    return templates.TemplateResponse(
        request, "stats.html", {"rows": rows}
    )


async def stream_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "stream.html", {})


async def stream_events(request: Request) -> StreamingResponse:
    tracker = request.app.state.tracker

    # Warm the profile cache with non-private fields for all users
    try:
        async with aiosqlite.connect(Config.USER_DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT u.uid, u.participant_type, p.skills, p.location "
                "FROM users u LEFT JOIN profiles p ON u.uid = p.uid"
            ) as cur:
                async for row in cur:
                    tracker.cache_profile(
                        row["uid"], row["participant_type"],
                        row["skills"], row["location"],
                    )
    except Exception:
        logger.exception("stream_events: profile cache warm failed")

    queue = tracker.subscribe()

    async def generate():
        try:
            # Send recent history oldest-first so the table builds chronologically
            for ev in reversed(tracker.get_recent_events()):
                yield f"data: {json.dumps(ev)}\n\n"
            # Stream new events as they arrive
            while True:
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            tracker.unsubscribe(queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
