from __future__ import annotations
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from starlette.websockets import WebSocket

logger = logging.getLogger(__name__)


class WSManager:
    """
    Registry of live WebSocket connections.
    Maps uid (int) → set of WebSockets (a user may have multiple clients:
    browser tab, openclaw channel plugin, etc.).

    Called by:
      - api/ws_route.py on connect / disconnect / receive
      - protocol/client.py._send() to push events to users
    """

    def __init__(self) -> None:
        self._connections: dict[int, set["WebSocket"]] = {}
        self._openclaw: dict[int, set["WebSocket"]] = {}
        self._openclaw_blocked: set[int] = set()   # uids where plugin interaction is paused
        self._openclaw_connected_at: dict[int, str] = {}  # uid → ISO timestamp
        self._lock = asyncio.Lock()

    async def connect(self, uid: int, ws: "WebSocket", *, openclaw: bool = False) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.setdefault(uid, set()).add(ws)
            if openclaw:
                if not self._openclaw.get(uid):
                    self._openclaw_connected_at[uid] = datetime.now(timezone.utc).isoformat()
                self._openclaw.setdefault(uid, set()).add(ws)
            total = sum(len(s) for s in self._connections.values())
        logger.info("WS connect uid=%d openclaw=%s (total=%d)", uid, openclaw, total)

    async def disconnect(self, uid: int, ws: "WebSocket") -> None:
        async with self._lock:
            sockets = self._connections.get(uid)
            if sockets is not None:
                sockets.discard(ws)
                if not sockets:
                    self._connections.pop(uid, None)
            oc = self._openclaw.get(uid)
            if oc is not None:
                oc.discard(ws)
                if not oc:
                    self._openclaw.pop(uid, None)
                    self._openclaw_connected_at.pop(uid, None)
            total = sum(len(s) for s in self._connections.values())
        logger.info("WS disconnect uid=%d (total=%d)", uid, total)

    def is_openclaw_connected(self, uid: int) -> bool:
        return bool(self._openclaw.get(uid))

    def openclaw_connected_at(self, uid: int) -> str | None:
        return self._openclaw_connected_at.get(uid)

    def set_openclaw_enabled(self, uid: int, enabled: bool) -> None:
        if enabled:
            self._openclaw_blocked.discard(uid)
        else:
            self._openclaw_blocked.add(uid)

    def is_openclaw_enabled(self, uid: int) -> bool:
        return uid not in self._openclaw_blocked

    async def send_to_browsers(self, uid: int, payload: dict) -> None:
        """Send to all connections for uid that are NOT openclaw sockets."""
        all_sockets  = set(self._connections.get(uid, ()))
        oc_sockets   = set(self._openclaw.get(uid, ()))
        browser_only = list(all_sockets - oc_sockets)
        if not browser_only:
            return
        text = json.dumps(payload)
        dead: list["WebSocket"] = []
        for ws in browser_only:
            try:
                await ws.send_text(text)
            except Exception as exc:
                logger.warning("send_to_browsers failed uid=%d: %s", uid, exc)
                dead.append(ws)
        for ws in dead:
            await self.disconnect(uid, ws)

    async def send_to_user(self, uid: int, payload: dict) -> None:
        sockets = list(self._connections.get(uid, ()))
        if not sockets:
            logger.warning("send_to_user: uid=%d not connected", uid)
            return
        # Stamp every outbound frame with a server-assigned mid so all tabs
        # receiving the same event use the same ID when persisting to the DB.
        if "mid" not in payload:
            payload = {**payload, "mid": str(uuid.uuid4())}
        text = json.dumps(payload)
        # When the plugin is paused, skip its sockets so events are only
        # delivered to browser connections.
        blocked = uid in self._openclaw_blocked
        oc_sockets = set(self._openclaw.get(uid, ())) if blocked else set()
        dead: list["WebSocket"] = []
        for ws in sockets:
            if blocked and ws in oc_sockets:
                continue
            try:
                await ws.send_text(text)
            except Exception as exc:
                logger.warning("send_to_user failed uid=%d: %s", uid, exc)
                dead.append(ws)
        for ws in dead:
            await self.disconnect(uid, ws)

    def active_uids(self) -> list[int]:
        return list(self._connections.keys())

    def count(self) -> int:
        return sum(len(s) for s in self._connections.values())
