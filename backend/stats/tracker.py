from __future__ import annotations
import asyncio
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class UserStat:
    uid:           int
    match_dispatched: int = 0
    supply_accepted:  int = 0
    supply_declined:  int = 0
    consent_given:    int = 0
    consent_declined: int = 0

    @property
    def accept_rate(self) -> float:
        total = self.supply_accepted + self.supply_declined
        return round(self.supply_accepted / total * 100, 1) if total else 0.0


@dataclass
class Event:
    ts:               str
    type:             str
    uid:              int
    cid:              str
    participant_type: str | None = None
    skills:           str | None = None
    location:         str | None = None


class StatsTracker:
    """
    In-process, in-memory stats store.
    Thread-safe via asyncio (single-threaded event loop).
    Resets on process restart — suitable for an admin overview.
    """

    def __init__(self, max_events: int = 200) -> None:
        self._users:         dict[int, UserStat]   = {}
        self._events:        deque[Event]           = deque(maxlen=max_events)
        self._active_cids:   set[str]               = set()
        self._profile_cache: dict[int, dict]        = {}
        self._subscribers:   list[asyncio.Queue]    = []

    def _user(self, uid: int) -> UserStat:
        if uid not in self._users:
            self._users[uid] = UserStat(uid=uid)
        return self._users[uid]

    def _record(self, event_type: str, uid: int, cid: str) -> None:
        cached = self._profile_cache.get(uid, {})
        ev = Event(
            ts=datetime.now(timezone.utc).isoformat(),
            type=event_type, uid=uid, cid=cid,
            participant_type=cached.get("participant_type"),
            skills=cached.get("skills"),
            location=cached.get("location"),
        )
        self._events.append(ev)
        payload = self._ev_dict(ev)
        for q in self._subscribers:
            q.put_nowait(payload)

    @staticmethod
    def _ev_dict(e: Event) -> dict:
        return {
            "ts": e.ts, "type": e.type, "uid": e.uid, "cid": e.cid[:8],
            "participant_type": e.participant_type,
            "skills": e.skills, "location": e.location,
        }

    # ------------------------------------------------------------------
    # Profile cache — populated by handler and stream route (no private fields)
    # ------------------------------------------------------------------

    def cache_profile(self, uid: int, participant_type: str | None,
                      skills: str | None, location: str | None) -> None:
        self._profile_cache[uid] = {
            "participant_type": participant_type,
            "skills": skills,
            "location": location,
        }

    # ------------------------------------------------------------------
    # SSE subscriber management
    # ------------------------------------------------------------------

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def get_recent_events(self) -> list[dict]:
        """Return last N events newest-first (callers reverse as needed)."""
        return [self._ev_dict(e) for e in reversed(self._events)][:50]

    # ------------------------------------------------------------------
    # Event methods
    # ------------------------------------------------------------------

    def demand_received(self, uid: int, cid: str) -> None:
        self._active_cids.add(cid)
        self._record("demand_received", uid, cid)

    def consent_given(self, uid: int, cid: str) -> None:
        self._user(uid).consent_given += 1
        self._record("consent_given", uid, cid)

    def consent_declined(self, uid: int, cid: str) -> None:
        self._user(uid).consent_declined += 1
        self._active_cids.discard(cid)
        self._record("consent_declined", uid, cid)

    def match_dispatched(self, uid: int, cid: str) -> None:
        self._user(uid).match_dispatched += 1
        self._record("match_dispatched", uid, cid)

    def supply_accepted(self, uid: int, cid: str) -> None:
        self._user(uid).supply_accepted += 1
        self._active_cids.discard(cid)
        self._record("supply_accepted", uid, cid)

    def supply_declined(self, uid: int, cid: str) -> None:
        self._user(uid).supply_declined += 1
        self._record("supply_declined", uid, cid)

    def task_finished(self, uid: int, cid: str) -> None:
        self._record("task_finished", uid, cid)

    # ------------------------------------------------------------------
    # Dashboard reads
    # ------------------------------------------------------------------

    def get_activity(self, pending_count: int, ws_count: int) -> dict:
        return {
            "active_cids":     len(self._active_cids),
            "pending_futures": pending_count,
            "connected_users": ws_count,
            "recent_events":   [
                {"ts": e.ts, "type": e.type, "uid": e.uid, "cid": e.cid[:8]}
                for e in reversed(self._events)
            ][:50],
        }

    def get_user_stats(self) -> list[dict]:
        return sorted(
            [
                {
                    "uid":              u.uid,
                    "match_dispatched": u.match_dispatched,
                    "supply_accepted":  u.supply_accepted,
                    "supply_declined":  u.supply_declined,
                    "consent_given":    u.consent_given,
                    "consent_declined": u.consent_declined,
                    "accept_rate":      u.accept_rate,
                }
                for u in self._users.values()
            ],
            key=lambda x: x["match_dispatched"],
            reverse=True,
        )
