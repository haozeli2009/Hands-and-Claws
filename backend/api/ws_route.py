"""
WebSocket endpoint at /ws/chat?token=<jwt>

Inbound message types  (client → server):
  { "type": "user_message",  "text": "..." }
  { "type": "consent_reply", "cid": "...", "consent_type": "data"|"task", "yes": bool }
  { "type": "finish_task",   "cid": "...", "demand_uid": int }
  { "type": "group_message", "room_id": "...", "text": "..." }
  { "type": "fetch_group",   "room_id": "..." }
  { "type": "cancel" }

Outbound message types (server → client):
  { "type": "data_consent",   "cid", "data", "intent" }
  { "type": "task_consent",   "cid", "task" }
  { "type": "status_update",  "cid", "message" }
  { "type": "group_message",  "room_id", "id", "uid", "username", "text", "ts" }
  { "type": "group_history",  "room_id", "messages": [...] }
  { "type": "error",          "message" }
"""
from __future__ import annotations
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from starlette.websockets import WebSocket, WebSocketDisconnect
from user.auth import get_uid_from_token
from starlette.exceptions import HTTPException
import aiosqlite
from config import Config

logger = logging.getLogger(__name__)

_HELP_TEXT = """\
Hands&Claws commands:
  /info                               — your uid, profile, tasks and demand status
  /getlist <demand>                   — search candidates (no LLM)
  /task [cid]                         — list tasks or get full task details
  /cancel                             — stop your current demand
  /finish <cid> [demand_uid]          — mark task as finished
  /join <room_id>                     — fetch group chat history
  /msg <room_id> <text>               — send a group message
  /rate <cid> <uid> <score> [comment] — rate a participant (score 1–5)
  /help                               — show this help\
"""


async def _build_user_info(uid: int, user_db, handler) -> dict:
    """Assemble the full user_info payload for a uid."""
    user_row = await user_db.get_by_uid(uid)
    profile  = await user_db.get_profile(uid)
    cards    = await user_db.get_task_cards(uid)
    busy     = handler.is_demand_active(uid)

    active_tasks = [c for c in cards if c.get("status") != "finished"]
    active_cids  = [c["card_id"] for c in active_tasks if c.get("card_id")]

    return {
        "type":          "user_info",
        "uid":           uid,
        "username":      user_row.username if user_row else f"user_{uid}",
        "name":          profile.name          if profile else "",
        "bio":           profile.bio           if profile else "",
        "skills":        profile.skills        if profile else "",
        "location":      profile.location      if profile else "",
        "availability":  profile.availability  if profile else False,
        "rating_avg":    profile.rating_avg    if profile else None,
        "rating_count":  profile.rating_count  if profile else 0,
        "participant_type": profile.participant_type if profile else "human",
        "demand_status": "busy" if busy else "idle",
        "active_cids":   active_cids,
        "tasks":         cards,
    }


def _format_task_card(card: dict) -> str:
    cid        = card.get("card_id", "?")
    role       = card.get("role", "?")
    status     = card.get("status", "active")
    intent     = card.get("intent") or card.get("demand_info", {}).get("intent") or ""
    ts         = (card.get("ts") or "")[:16].replace("T", " ")
    parts      = [f"task:{cid[:8]}… role={role} status={status}"]
    if intent:
        parts.append(f"  intent:  {str(intent)[:120]}")
    if ts:
        parts.append(f"  created: {ts}")

    participants = card.get("participants") or []
    if participants:
        names = ", ".join(
            f"{p.get('name') or 'uid:' + str(p.get('uid', '?'))} [{p.get('status','active')}]"
            for p in participants
        )
        parts.append(f"  supply:  {names}")

    demand_info = card.get("demand_info")
    if demand_info:
        d_name = demand_info.get("name") or f"uid:{demand_info.get('uid', '?')}"
        parts.append(f"  demand:  {d_name}")

    peers = card.get("peers") or []
    if peers:
        peer_names = ", ".join(
            f"{p.get('name') or 'uid:' + str(p.get('uid', '?'))} [{p.get('status','active')}]"
            for p in peers
        )
        parts.append(f"  peers:   {peer_names}")

    return "\n".join(parts)


def _parse_slash(text: str) -> tuple[str, str] | None:
    """Split '/name args' → ('name', 'args'). Returns None if not a slash command."""
    if not text.startswith('/'):
        return None
    parts = text.split(' ', 1)
    return parts[0][1:].lower(), (parts[1].strip() if len(parts) > 1 else '')


async def _dispatch_command(
    name: str, args: str, uid: int,
    manager, protocol, user_db, handler,
) -> None:
    """Route a parsed slash command to the appropriate handler."""
    cid = ""   # commands not tied to a task use the general (null) slot

    if name == "info":
        info = await _build_user_info(uid, user_db, handler)
        await manager.send_to_user(uid, info)
        return

    if name == "getlist":
        demand = args.strip()
        if not demand:
            await protocol.send_status(cid, uid, "Usage: /getlist <demand>")
            return
        asyncio.create_task(_handle_get_list(uid, demand, protocol))

    elif name == "cancel":
        await handler.cancel_demand(uid)
        await manager.send_to_user(uid, {"type": "status_update", "cid": cid, "message": "Stopped."})

    elif name == "finish":
        parts = args.split()
        if not parts:
            await protocol.send_status(cid, uid, "Usage: /finish <cid> [demand_uid]")
            return
        task_cid = parts[0]
        demand_uid = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None
        await protocol.trigger_task_finish(task_cid, uid, demand_uid)

    elif name == "join":
        room_id = args.strip()
        if not room_id:
            await protocol.send_status(cid, uid, "Usage: /join <room_id>")
            return
        messages = await user_db.get_group_messages(room_id)
        await manager.send_to_user(uid, {"type": "group_history", "room_id": room_id, "messages": messages})

    elif name == "msg":
        parts = args.split(' ', 1)
        if len(parts) < 2 or not parts[1].strip():
            await protocol.send_status(cid, uid, "Usage: /msg <room_id> <text>")
            return
        room_id, text = parts[0].strip(), parts[1].strip()
        if room_id and text:
            user_row = await user_db.get_by_uid(uid)
            username = user_row.username if user_row else f"user_{uid}"
            msg_id = str(uuid.uuid4())
            ts = datetime.now(timezone.utc).isoformat()
            await user_db.save_group_message(room_id, msg_id, uid, username, text, ts)
            payload = {
                "type": "group_message", "room_id": room_id,
                "id": msg_id, "uid": uid, "username": username, "text": text, "ts": ts,
            }
            members = await user_db.get_room_members(room_id)
            for m in members:
                await manager.send_to_user(m["uid"], payload)

    elif name == "rate":
        parts = args.split(None, 3)
        if len(parts) < 3:
            await protocol.send_status(cid, uid, "Usage: /rate <cid> <uid> <score 1-5> [comment]")
            return
        task_cid, rated_uid_s, score_s = parts[0], parts[1], parts[2]
        comment = parts[3] if len(parts) > 3 else ""
        try:
            rated_uid = int(rated_uid_s)
            score = int(score_s)
        except ValueError:
            await protocol.send_status(cid, uid, "Usage: /rate <cid> <uid> <score 1-5> [comment]")
            return
        saved = await user_db.submit_rating(
            cid=task_cid, rater_uid=uid, rated_uid=rated_uid,
            score=score, comment=comment,
        )
        if saved:
            pr = await user_db.get_profile(rated_uid)
            await manager.send_to_user(uid, {
                "type": "rating_saved", "cid": task_cid, "rated_uid": rated_uid,
                "rating_avg": pr.rating_avg if pr else None,
                "rating_count": pr.rating_count if pr else 0,
            })
        else:
            await protocol.send_status(cid, uid, "Rating not saved (already rated or invalid task).")

    elif name == "task":
        card_id = args.strip()
        if card_id:
            card = await user_db.get_task_card(uid, card_id)
            if card is None:
                await protocol.send_status(cid, uid, f"Task not found: {card_id}")
            else:
                await protocol.send_status(cid, uid, _format_task_card(card))
        else:
            cards = await user_db.get_task_cards(uid)
            if not cards:
                await protocol.send_status(cid, uid, "No tasks.")
            else:
                lines = [f"{len(cards)} task(s):"]
                for c in cards:
                    short_id = c.get("card_id", "?")[:8]
                    role     = c.get("role", "?")
                    status   = c.get("status", "active")
                    lines.append(f"  {short_id}… role={role} status={status}")
                lines.append("Use /task <cid> for full details.")
                await protocol.send_status(cid, uid, "\n".join(lines))

    elif name == "help":
        await protocol.send_status(cid, uid, _HELP_TEXT)

    else:
        await protocol.send_status(cid, uid, f"Unknown command: /{name}\nType /help for available commands.")


async def _resolve_uid(token: str, user_db) -> tuple[int | None, bool]:
    """Try JWT first; fall back to openclaw plugin token lookup.
    Returns (uid, is_openclaw)."""
    try:
        return get_uid_from_token(token), False
    except HTTPException:
        pass
    from config import Config
    async with aiosqlite.connect(Config.USER_DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT uid FROM users WHERE openclaw_token=?", (token,)
        ) as cur:
            row = await cur.fetchone()
    return (row["uid"], True) if row else (None, False)


async def _handle_accept_pending_offer(
    cid: str, uid: int, yes: bool,
    user_db, protocol, manager, handler,
) -> None:
    if yes:
        await protocol.send_task_card(uid, {
            "card_id": cid, "role": "supply", "status": "active",
        })
        await protocol.broadcast_group_message(
            cid, uid, text="joined this task", kind="task_joined_late",
        )
        messages = await user_db.get_group_messages(cid)
        await manager.send_to_user(uid, {
            "type": "group_history", "room_id": cid, "messages": messages,
        })
        handler._cid_to_supply_uids.setdefault(cid, []).append(uid)
        demand_uid = handler._cid_to_demand.get(cid)
        if demand_uid is not None:
            pr       = await user_db.get_profile(uid)
            user_row = await user_db.get_by_uid(uid)
            name = (pr.name if pr else None) or (user_row.username if user_row else f"user_{uid}")
            await protocol.send_task_card(demand_uid, {
                "card_id": cid, "role": "demand",
                "new_participant": {"uid": uid, "name": name, "status": "active"},
            })
        logger.info("Pending offer accepted uid=%d cid=%s", uid, cid)
    else:
        await user_db.delete_task_card(uid, cid)
        logger.info("Pending offer declined uid=%d cid=%s", uid, cid)


async def _handle_get_list(uid: int, demand: str, protocol) -> None:
    """FTS candidate search — bypasses delegate/LLM, returns list immediately."""
    cid = ""   # no task cid; empty string shows in the general (null-activeCid) view
    try:
        await protocol.send_pipeline_step(
            cid, uid, "gl_fetch",
            "Searching candidates",
            demand[:60] + ("…" if len(demand) > 60 else ""),
        )
        shortlist = await protocol.search_profiles(
            query=demand, exclude_uid=uid, limit=Config.FTS_CANDIDATE_POOL,
        )
        if not shortlist:
            await protocol.send_pipeline_step(
                cid, uid, "gl_fetch",
                "No candidates found", "Nobody matches this demand.", "done",
            )
            return
        all_users  = await protocol.get_all_users()
        uname_map  = {u.uid: u.username for u in all_users}
        candidates = [
            {
                "uid":       pr.uid,
                "name":      pr.name or uname_map.get(pr.uid) or f"User {pr.uid}",
                "skills":    pr.skills,
                "bio":       pr.bio,
                "location":  pr.location,
                "available": pr.availability,
            }
            for pr in shortlist
        ]
        label = f"{len(shortlist)} candidate{'s' if len(shortlist) != 1 else ''} found"
        await protocol.send_pipeline_step(
            cid, uid, "gl_fetch", label,
            demand[:60] + ("…" if len(demand) > 60 else ""),
            "done", extra={"candidates": candidates},
        )
    except Exception:
        logger.exception("_handle_get_list error uid=%d", uid)
        await protocol.send_pipeline_step(
            cid, uid, "gl_fetch", "Search failed", "An error occurred.", "failed",
        )


async def ws_chat(ws: WebSocket) -> None:
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001, reason="Missing token")
        return
    user_db  = ws.app.state.user_db
    uid, is_openclaw = await _resolve_uid(token, user_db)
    if uid is None:
        await ws.close(code=4001, reason="Invalid token")
        return

    manager  = ws.app.state.ws_manager
    protocol = ws.app.state.protocol
    user_db  = ws.app.state.user_db

    await manager.connect(uid, ws, openclaw=is_openclaw)
    user_row = await user_db.get_by_uid(uid)
    # Send welcome only to THIS socket — not to all uid connections.
    # send_to_user would also deliver to the OpenClaw plugin already connected,
    # which would confuse it into thinking it needs to re-handshake.
    await ws.send_text(json.dumps({
        "type": "welcome",
        "uid": uid,
        "username": user_row.username if user_row else f"user_{uid}",
        "openclaw_connected": manager.is_openclaw_connected(uid),
        "openclaw_enabled": manager.is_openclaw_enabled(uid),
        "openclaw_connected_at": manager.openclaw_connected_at(uid),
        "mid": str(uuid.uuid4()),
    }))
    if is_openclaw:
        await manager.send_to_browsers(uid, {
            "type": "openclaw_status",
            "connected": True,
            "enabled": manager.is_openclaw_enabled(uid),
            "connected_at": manager.openclaw_connected_at(uid),
        })
    try:
        async for raw in ws.iter_text():
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_to_user(uid, {"type": "error", "message": "Invalid JSON"})
                continue

            # Drop all interaction from a paused plugin — connection stays open.
            if is_openclaw and not manager.is_openclaw_enabled(uid):
                continue

            # Relay every plugin message to browsers so the CLI view can show it.
            if is_openclaw:
                asyncio.create_task(
                    manager.send_to_browsers(uid, {
                        "type": "openclaw_io",
                        "direction": "in",
                        "payload": msg,
                    })
                )

            mtype = msg.get("type")

            if mtype == "user_message":
                text = (msg.get("text") or "").strip()
                if text:
                    cmd = _parse_slash(text)
                    if cmd:
                        await _dispatch_command(
                            cmd[0], cmd[1], uid,
                            manager, protocol, user_db,
                            ws.app.state.handler,
                        )
                    else:
                        await protocol.trigger_new_message(uid, text)

            elif mtype == "finish_task":
                cid = msg.get("cid", "")
                demand_uid = msg.get("demand_uid")
                if cid:
                    await protocol.trigger_task_finish(
                        cid, uid,
                        demand_uid=int(demand_uid) if demand_uid is not None else None,
                    )

            elif mtype == "consent_reply":
                cid          = msg.get("cid", "")
                yes          = bool(msg.get("yes", False))
                consent_type = msg.get("consent_type", "")
                if consent_type == "task":
                    await protocol.trigger_task_consent(cid, uid, yes)
                else:
                    await protocol.trigger_data_consent(cid, uid, yes)

            elif mtype == "group_message":
                room_id = (msg.get("room_id") or "").strip()
                text    = (msg.get("text")    or "").strip()
                if room_id and text:
                    user_row = await user_db.get_by_uid(uid)
                    username = user_row.username if user_row else f"user_{uid}"
                    msg_id   = str(uuid.uuid4())
                    ts       = datetime.now(timezone.utc).isoformat()
                    await user_db.save_group_message(room_id, msg_id, uid, username, text, ts)
                    payload  = {
                        "type": "group_message", "room_id": room_id,
                        "id": msg_id, "uid": uid, "username": username, "text": text, "ts": ts,
                    }
                    members = await user_db.get_room_members(room_id)
                    for m in members:
                        await manager.send_to_user(m["uid"], payload)

            elif mtype == "fetch_group":
                room_id = (msg.get("room_id") or "").strip()
                if room_id:
                    messages = await user_db.get_group_messages(room_id)
                    await manager.send_to_user(uid, {
                        "type": "group_history", "room_id": room_id, "messages": messages,
                    })

            elif mtype == "submit_rating":
                cid       = (msg.get("cid") or "").strip()
                rated_uid = msg.get("rated_uid")
                score     = msg.get("score")
                comment   = (msg.get("comment") or "").strip()
                if cid and rated_uid is not None and score is not None:
                    saved = await user_db.submit_rating(
                        cid=cid, rater_uid=uid,
                        rated_uid=int(rated_uid), score=int(score),
                        comment=comment,
                    )
                    if saved:
                        pr = await user_db.get_profile(int(rated_uid))
                        await manager.send_to_user(uid, {
                            "type": "rating_saved", "cid": cid, "rated_uid": rated_uid,
                            "rating_avg": pr.rating_avg if pr else None,
                            "rating_count": pr.rating_count if pr else 0,
                        })

            elif mtype == "get_info":
                info = await _build_user_info(uid, user_db, ws.app.state.handler)
                await manager.send_to_user(uid, info)

            elif mtype == "get_task":
                card_id = (msg.get("cid") or "").strip()
                if card_id:
                    card = await user_db.get_task_card(uid, card_id)
                    if card is None:
                        await protocol.send_status("", uid, f"Task not found: {card_id}")
                    else:
                        await manager.send_to_user(uid, {"type": "task_info", "card": card})
                else:
                    cards = await user_db.get_task_cards(uid)
                    await manager.send_to_user(uid, {"type": "task_list", "cards": cards})

            elif mtype == "get_list":
                demand = (msg.get("demand") or "").strip()
                if demand:
                    asyncio.create_task(_handle_get_list(uid, demand, protocol))

            elif mtype == "accept_pending_offer":
                cid = (msg.get("cid") or "").strip()
                yes = bool(msg.get("yes", False))
                if cid:
                    await _handle_accept_pending_offer(
                        cid, uid, yes,
                        user_db, protocol, manager, ws.app.state.handler,
                    )

            elif mtype == "cancel":
                handler = ws.app.state.handler
                await handler.cancel_demand(uid)
                await manager.send_to_user(uid, {
                    "type": "status_update", "cid": "", "message": "Stopped.",
                })

            elif mtype == "openclaw_set_enabled" and not is_openclaw:
                enabled = bool(msg.get("enabled", True))
                manager.set_openclaw_enabled(uid, enabled)
                logger.info("openclaw_set_enabled uid=%d enabled=%s", uid, enabled)
                await manager.send_to_browsers(uid, {
                    "type": "openclaw_status",
                    "connected": manager.is_openclaw_connected(uid),
                    "enabled": enabled,
                })

            else:
                logger.debug("Unknown WS type %r uid=%d", mtype, uid)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("WS error uid=%d: %s", uid, exc)
    finally:
        await manager.disconnect(uid, ws)
        if is_openclaw and not manager.is_openclaw_connected(uid):
            await manager.send_to_browsers(uid, {
                "type": "openclaw_status",
                "connected": False,
                "enabled": manager.is_openclaw_enabled(uid),
            })
