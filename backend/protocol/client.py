"""
ProtocolClient — self-contained bridge, no external package needed.

Routes:
  Browser-bound events  → ws_manager.send_to_user()
  Agent-to-agent        → in-process callbacks registered by Handler
  DB reads              → real UserDB (injected at startup)
"""
from __future__ import annotations
import logging
import uuid
from datetime import datetime, timezone
from typing import Callable, Any

logger = logging.getLogger(__name__)


class ProtocolClient:
    def __init__(self) -> None:
        self._ws_manager: Any = None
        self._user_db:    Any = None
        self._cancelled_cids: set[str] = set()
        self._cb_new_message           = None
        self._cb_data_consent          = None
        self._cb_task_consent          = None
        self._cb_task_from_orchestrator = None
        self._cb_is_accept             = None
        self._cb_package_from_delegate = None
        self._cb_task_finish           = None

    def set_ws_manager(self, manager: Any) -> None:
        self._ws_manager = manager

    def set_user_db(self, db: Any) -> None:
        """Inject the UserDB so agents can read profiles."""
        self._user_db = db

    async def connect(self) -> None:
        logger.info("ProtocolClient ready (self-contained mode).")

    # ------------------------------------------------------------------
    # Callback registration
    # ------------------------------------------------------------------
    def on_new_message(self,           cb: Callable) -> None: self._cb_new_message           = cb
    def on_data_consent(self,          cb: Callable) -> None: self._cb_data_consent          = cb
    def on_task_consent(self,          cb: Callable) -> None: self._cb_task_consent          = cb
    def on_task_from_orchestrator(self,cb: Callable) -> None: self._cb_task_from_orchestrator = cb
    def on_is_accept(self,             cb: Callable) -> None: self._cb_is_accept             = cb
    def on_package_from_delegate(self, cb: Callable) -> None: self._cb_package_from_delegate = cb
    def on_task_finish(self,           cb: Callable) -> None: self._cb_task_finish           = cb

    # ------------------------------------------------------------------
    # Inbound triggers (called by ws_route.py)
    # ------------------------------------------------------------------
    async def trigger_new_message(self, uid: int, text: str) -> None:
        if self._cb_new_message:
            await self._cb_new_message(uid, text)

    async def trigger_data_consent(self, cid: str, uid: int, yes: bool) -> None:
        if self._cb_data_consent:
            await self._cb_data_consent(cid, uid, yes)

    async def trigger_task_consent(self, cid: str, uid: int, yes: bool) -> None:
        if self._cb_task_consent:
            await self._cb_task_consent(cid, uid, yes)

    async def trigger_is_accept(self, cid: str, uid: int, accepted: bool) -> None:
        if self._cb_is_accept:
            await self._cb_is_accept(cid, uid, accepted)

    async def trigger_task_finish(self, cid: str, supply_uid: int,
                                   demand_uid: int | None = None) -> None:
        if self._cb_task_finish:
            await self._cb_task_finish(cid, supply_uid, demand_uid)

    # ------------------------------------------------------------------
    # DB reads — wired to real UserDB
    # ------------------------------------------------------------------
    async def read_private_context(self, uid: int) -> str:
        """Load a user's full private profile for in-agent context only."""
        if self._user_db is None:
            return ""
        profile = await self._user_db.get_profile(uid)
        return profile.as_text() if profile else ""

    async def read_member_profile(self, uid: int) -> str:
        """Load a member's profile (same store, separate semantic role)."""
        return await self.read_private_context(uid)

    async def get_all_profiles(self, exclude_uid: int = -1):
        """Return all ProfileRow objects except exclude_uid."""
        if self._user_db is None:
            return []
        return await self._user_db.get_all_profiles(exclude_uid=exclude_uid)

    async def search_profiles(self, query: str, exclude_uid: int = -1, limit: int = 50):
        """FTS shortlist for ranking — availability-filtered, no full table scan."""
        if self._user_db is None:
            return []
        return await self._user_db.search_profiles(query=query, exclude_uid=exclude_uid,
                                                    limit=limit)

    async def search_fallback_profiles(self, query: str, limit: int = 10):
        """FTS search restricted to fallback users — used when no real users match."""
        if self._user_db is None:
            return []
        return await self._user_db.search_fallback_profiles(query=query, limit=limit)

    async def get_profile(self, uid: int):
        """Return a single ProfileRow by uid, or None."""
        if self._user_db is None:
            return None
        return await self._user_db.get_profile(uid)

    async def get_all_users(self):
        """Return all UserRow objects (uid, username, email)."""
        if self._user_db is None:
            return []
        return await self._user_db.get_all()

    # ------------------------------------------------------------------
    # Delegate → browser
    # ------------------------------------------------------------------
    async def ask_data_consent(self, cid: str, uid: int, data: str, intent: str) -> None:
        await self._send(uid, {"type": "data_consent", "cid": cid,
                               "data": data, "intent": intent})

    async def ask_task_consent(self, cid: str, uid: int, task: str) -> None:
        await self._send(uid, {"type": "task_consent", "cid": cid, "task": task})

    async def send_thinking(self, cid: str, uid: int, text: str) -> None:
        if cid in self._cancelled_cids:
            return
        await self._send(uid, {"type": "thinking_update", "cid": cid, "text": text})

    async def send_task_card(self, uid: int, card: dict) -> None:
        await self._send(uid, {"type": "task_card", **card})

    async def send_rate_prompt(self, uid: int, cid: str,
                                rated_uid: int, rated_name: str) -> None:
        await self._send(uid, {"type": "rate_prompt", "cid": cid,
                               "rated_uid": rated_uid, "rated_name": rated_name})

    async def broadcast_group_message(self, room_id: str, uid: int, text: str,
                                       kind: str = "") -> None:
        """Persist a group message and send it to every member of the room.

        If `kind` is non-empty, the message is an event (rendered as a card by the UI).
        `text` should still be a human-readable fallback so older clients show
        something sensible even without card styling.
        """
        if self._user_db is None or self._ws_manager is None:
            logger.warning("broadcast_group_message: db or ws_manager not set")
            return
        user = await self._user_db.get_by_uid(uid)
        username = user.username if user else f"user_{uid}"
        msg_id = str(uuid.uuid4())
        ts = datetime.now(timezone.utc).isoformat()
        await self._user_db.save_group_message(room_id, msg_id, uid, username, text, ts, kind)
        payload = {
            "type": "group_message", "room_id": room_id,
            "id": msg_id, "uid": uid, "username": username, "text": text, "ts": ts,
            "kind": kind,
        }
        for m in await self._user_db.get_room_members(room_id):
            await self._ws_manager.send_to_user(m["uid"], payload)

    async def send_pipeline_step(self, cid: str, uid: int, step_id: str,
                                  label: str, detail: str = "",
                                  status: str = "running",
                                  extra: dict | None = None) -> None:
        if cid in self._cancelled_cids:
            return
        payload = {"type": "pipeline_step", "cid": cid,
                   "id": step_id, "label": label, "detail": detail, "status": status}
        if extra:
            payload["extra"] = extra
        await self._send(uid, payload)

    async def send_status(self, cid: str, uid: int, status_list: str) -> None:
        if cid in self._cancelled_cids:
            return
        await self._send(uid, {"type": "status_update", "cid": cid, "message": status_list})

    # ------------------------------------------------------------------
    # Delegate ↔ Orchestrator (in-process)
    # ------------------------------------------------------------------
    async def get_github_installation(self, uid: int):
        """Return GithubInstallationRow for uid, or None."""
        if self._user_db is None:
            return None
        return await self._user_db.get_github_installation(uid)

    async def send_package_to_orchestrator(self, cid: str, uid: int,
                                            data: str, intent: str,
                                            github_context: dict | None = None) -> None:
        if self._cb_package_from_delegate:
            await self._cb_package_from_delegate(cid, uid, data, intent, github_context)

    async def send_task_to_delegate(self, cid: str, uid: int, task: str) -> None:
        if self._cb_task_from_orchestrator:
            await self._cb_task_from_orchestrator(cid, uid, task)

    async def send_accept_to_orchestrator(self, cid: str, uid: int, accepted: bool) -> None:
        await self.trigger_is_accept(cid, uid, accepted)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    async def _send(self, uid: int, payload: dict) -> None:
        if self._ws_manager is None:
            logger.warning("ProtocolClient._send: ws_manager not set uid=%d", uid)
            return
        await self._ws_manager.send_to_user(uid, payload)
