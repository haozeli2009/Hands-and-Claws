import asyncio, sys, os
from config import Config
from logging_cfg.setup import setup_logging
setup_logging(Config.LOG_LEVEL, Config.LOG_FILE, Config.LOG_MAX_BYTES, Config.LOG_BACKUP_COUNT)

import logging
import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.routing import Route, WebSocketRoute
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException

from protocol.client import ProtocolClient
from user_ws.manager import WSManager
from user.db import UserDB
from utils.llm import LLMClient
from gateway.handler import Handler
from stats.tracker import StatsTracker
from dashboard.auth import BasicAuthMiddleware
from api.auth_routes import register, login, me, get_profile, update_profile, register_agent
from api.github_oauth import providers as auth_providers, github_start, github_callback
from api.ws_route import ws_chat
from api.history_routes import get_history, save_message, save_task, delete_task, delete_orphan_messages
from api.llm_config_routes import get_llm_config, put_llm_config, delete_llm_config
from api.openclaw_routes import get_openclaw_token, rotate_openclaw_token, get_openclaw_status
from api.avatar_routes import get_avatar, upload_avatar, delete_avatar
from api.marketplace_webhook import marketplace_webhook
from api.github_app_routes import (
    github_app_start, github_app_callback, github_app_status,
    github_app_repos_refresh, github_app_disconnect, github_action,
)
from dashboard.routes import activity, stats, stream_page, stream_events

logger = logging.getLogger("main")


def _validate():
    if Config.LLM_PROVIDER == "anthropic" and not Config.ANTHROPIC_API_KEY:
        sys.exit("ERROR: ANTHROPIC_API_KEY not set.")
    if Config.LLM_PROVIDER == "openai" and not Config.OPENAI_API_KEY:
        sys.exit("ERROR: OPENAI_API_KEY not set.")
    if Config.JWT_SECRET == "change-me-in-production":
        logger.warning("JWT_SECRET is using the default — set it in .env before deploying.")


async def http_error(request, exc):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


def build_app(ws_manager, user_db, handler, tracker, protocol) -> Starlette:
    routes = [
        Route("/api/auth/register",        register,       methods=["POST"]),
        Route("/api/auth/register/agent", register_agent, methods=["POST"]),
        Route("/api/auth/login",     login,           methods=["POST"]),
        Route("/api/auth/providers",        auth_providers,  methods=["GET"]),
        Route("/api/auth/github/start",     github_start,    methods=["GET"]),
        Route("/api/auth/github/callback",  github_callback, methods=["GET"]),
        Route("/api/user/me",        me,              methods=["GET"]),
        Route("/api/user/profile",   get_profile,     methods=["GET"]),
        Route("/api/user/profile",   update_profile,  methods=["PUT"]),
        Route("/api/user/llm",       get_llm_config,    methods=["GET"]),
        Route("/api/user/llm",       put_llm_config,    methods=["PUT"]),
        Route("/api/user/llm",       delete_llm_config, methods=["DELETE"]),
        Route("/api/user/openclaw-token",        get_openclaw_token,    methods=["GET"]),
        Route("/api/user/openclaw-token/rotate", rotate_openclaw_token, methods=["POST"]),
        Route("/api/user/openclaw-status",       get_openclaw_status,   methods=["GET"]),
        Route("/api/github/app/start",           github_app_start,          methods=["GET"]),
        Route("/api/github/app/callback",        github_app_callback,       methods=["GET"]),
        Route("/api/github/app/status",          github_app_status,         methods=["GET"]),
        Route("/api/github/app/repos/refresh",   github_app_repos_refresh,  methods=["POST"]),
        Route("/api/github/app",                 github_app_disconnect,     methods=["DELETE"]),
        Route("/api/github/action",              github_action,             methods=["POST"]),
        Route("/api/github/marketplace/webhook", marketplace_webhook,       methods=["POST"]),
        Route("/api/user/avatar/{uid:int}",      get_avatar,            methods=["GET"]),
        Route("/api/user/avatar",                upload_avatar,         methods=["POST"]),
        Route("/api/user/avatar",                delete_avatar,         methods=["DELETE"]),
        Route("/api/history",                get_history,   methods=["GET"]),
        Route("/api/history/messages",       save_message,  methods=["POST"]),
        Route("/api/history/messages/orphans", delete_orphan_messages, methods=["DELETE"]),
        Route("/api/history/tasks",          save_task,     methods=["POST"]),
        Route("/api/history/tasks/{card_id}", delete_task,  methods=["DELETE"]),
        WebSocketRoute("/ws/chat",   ws_chat),
        Route("/dashboard",               activity,      methods=["GET"]),
        Route("/dashboard/stats",         stats,         methods=["GET"]),
        Route("/dashboard/stream",        stream_page,   methods=["GET"]),
        Route("/dashboard/stream/events", stream_events, methods=["GET"]),
        Route("/health",             lambda r: JSONResponse({"ok": True}), methods=["GET"]),
    ]
    app = Starlette(
        routes=routes,
        middleware=[Middleware(BasicAuthMiddleware)],
        exception_handlers={HTTPException: http_error},
    )
    app.state.ws_manager = ws_manager
    app.state.user_db    = user_db
    app.state.handler    = handler
    app.state.tracker    = tracker
    app.state.protocol   = protocol
    return app


async def main():
    _validate()

    user_db    = UserDB(Config.USER_DB_PATH)
    await user_db.init()

    # Drop and recreate profiles table to pick up schema changes
    # (safe in dev — remove this block after first production deploy)
    import aiosqlite, os
    if os.path.exists(Config.USER_DB_PATH):
        async with aiosqlite.connect(Config.USER_DB_PATH) as db:
            await db.execute("CREATE TABLE IF NOT EXISTS profiles ("
                "uid INTEGER PRIMARY KEY REFERENCES users(uid),"
                "name TEXT NOT NULL DEFAULT '',"
                "bio TEXT NOT NULL DEFAULT '',"
                "skills TEXT NOT NULL DEFAULT '',"
                "location TEXT NOT NULL DEFAULT '',"
                "availability INTEGER NOT NULL DEFAULT 1,"
                "updated_at TEXT NOT NULL DEFAULT '')")
            await db.commit()

    ws_manager = WSManager()
    protocol   = ProtocolClient()
    protocol.set_ws_manager(ws_manager)
    protocol.set_user_db(user_db)           # <-- wire in real DB
    await protocol.connect()

    tracker    = StatsTracker()
    llm        = LLMClient(Config.LLM_PROVIDER, Config.LLM_MODEL)
    handler    = Handler(protocol=protocol, llm=llm, tracker=tracker, user_db=user_db)
    handler.register_all()

    logger.info("System ready — %s / %s on port %d",
                Config.LLM_PROVIDER, Config.LLM_MODEL, Config.SERVER_PORT)

    app    = build_app(ws_manager, user_db, handler, tracker, protocol)
    config = uvicorn.Config(app, host=Config.SERVER_HOST, port=Config.SERVER_PORT,
                            log_config=None, loop="none")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutdown.")
