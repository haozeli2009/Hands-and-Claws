from __future__ import annotations
import aiosqlite
import os
import re
import uuid
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class UserRow:
    uid:              int
    username:         str
    email:            str
    participant_type: str = "human"


@dataclass
class LlmConfigRow:
    uid:                int
    provider:           str
    model:              str
    api_key_ciphertext: str
    updated_at:         str


@dataclass
class ProfileRow:
    uid:              int
    name:             str        = ""
    bio:              str        = ""
    skills:           str        = ""
    location:         str        = ""
    availability:     bool       = True
    updated_at:       str        = ""
    rating_avg:       float|None = field(default=None)
    rating_count:     int        = 0
    participant_type: str        = "human"

    def as_text(self) -> str:
        avail = "available" if self.availability else "unavailable"
        return (
            f"User {self.uid} — {self.name or 'unnamed'} [{self.participant_type}]\n"
            f"Bio: {self.bio or 'none'}\n"
            f"Skills: {self.skills or 'none'}\n"
            f"Location: {self.location or 'unknown'}\n"
            f"Status: {avail}"
        )

    def as_anonymous_text(self) -> str:
        """Skills + rating view for Orchestrator ranking — no PII exposed to user-controlled models."""
        parts = [
            f"Type: {self.participant_type}",
            f"Skills: {self.skills or 'none'}",
        ]
        if self.rating_count and self.rating_count > 0:
            parts.append(f"Rating: {self.rating_avg:.1f}/5 ({self.rating_count} reviews)")
        return "\n".join(parts)

    def as_dict(self) -> dict:
        return {
            "uid": self.uid, "name": self.name, "bio": self.bio,
            "skills": self.skills, "location": self.location,
            "availability": self.availability, "updated_at": self.updated_at,
            "rating_avg": self.rating_avg, "rating_count": self.rating_count,
            "participant_type": self.participant_type,
        }


class UserDB:
    def __init__(self, db_path: str) -> None:
        self._path = db_path

    async def init(self) -> None:
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
        async with aiosqlite.connect(self._path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    uid             INTEGER PRIMARY KEY AUTOINCREMENT,
                    username        TEXT NOT NULL UNIQUE,
                    email           TEXT NOT NULL UNIQUE,
                    hashed_password TEXT NOT NULL,
                    created_at      TEXT NOT NULL
                )""")
            # Evolving columns added via ALTER for existing DBs
            async with db.execute("PRAGMA table_info(users)") as cur:
                ucols = {r[1] for r in await cur.fetchall()}
            if "github_id" not in ucols:
                await db.execute("ALTER TABLE users ADD COLUMN github_id TEXT")
            await db.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id "
                "ON users(github_id) WHERE github_id IS NOT NULL"
            )
            if "openclaw_token" not in ucols:
                await db.execute("ALTER TABLE users ADD COLUMN openclaw_token TEXT")
            await db.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_openclaw_token "
                "ON users(openclaw_token) WHERE openclaw_token IS NOT NULL"
            )
            if "participant_type" not in ucols:
                await db.execute(
                    "ALTER TABLE users ADD COLUMN participant_type TEXT NOT NULL DEFAULT 'human'"
                )
            await db.execute("""
                CREATE TABLE IF NOT EXISTS profiles (
                    uid          INTEGER PRIMARY KEY REFERENCES users(uid),
                    name         TEXT NOT NULL DEFAULT '',
                    bio          TEXT NOT NULL DEFAULT '',
                    skills       TEXT NOT NULL DEFAULT '',
                    location     TEXT NOT NULL DEFAULT '',
                    availability INTEGER NOT NULL DEFAULT 1,
                    updated_at   TEXT NOT NULL DEFAULT ''
                )""")
            # Add rating columns to profiles if upgrading from older schema
            async with db.execute("PRAGMA table_info(profiles)") as cur:
                pcols = {r[1] for r in await cur.fetchall()}
            if "rating_avg" not in pcols:
                await db.execute("ALTER TABLE profiles ADD COLUMN rating_avg REAL")
            if "rating_count" not in pcols:
                await db.execute(
                    "ALTER TABLE profiles ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0"
                )
            await db.execute("""
                CREATE TABLE IF NOT EXISTS ratings (
                    id          TEXT PRIMARY KEY,
                    cid         TEXT NOT NULL,
                    rater_uid   INTEGER NOT NULL REFERENCES users(uid),
                    rated_uid   INTEGER NOT NULL REFERENCES users(uid),
                    score       INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
                    comment     TEXT NOT NULL DEFAULT '',
                    created_at  TEXT NOT NULL,
                    UNIQUE(cid, rater_uid, rated_uid)
                )""")
            await db.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS profiles_fts USING fts5(
                    skills, bio,
                    content=profiles,
                    content_rowid=uid
                )""")
            await db.execute("""
                CREATE TRIGGER IF NOT EXISTS profiles_ai AFTER INSERT ON profiles BEGIN
                    INSERT INTO profiles_fts(rowid, skills, bio)
                        VALUES (new.uid, new.skills, new.bio);
                END""")
            await db.execute("""
                CREATE TRIGGER IF NOT EXISTS profiles_au AFTER UPDATE ON profiles BEGIN
                    INSERT INTO profiles_fts(profiles_fts, rowid, skills, bio)
                        VALUES ('delete', old.uid, old.skills, old.bio);
                    INSERT INTO profiles_fts(rowid, skills, bio)
                        VALUES (new.uid, new.skills, new.bio);
                END""")
            await db.execute("""
                CREATE TRIGGER IF NOT EXISTS profiles_ad AFTER DELETE ON profiles BEGIN
                    INSERT INTO profiles_fts(profiles_fts, rowid, skills, bio)
                        VALUES ('delete', old.uid, old.skills, old.bio);
                END""")
            await db.execute("INSERT INTO profiles_fts(profiles_fts) VALUES('rebuild')")
            await db.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id   TEXT PRIMARY KEY,
                    uid  INTEGER NOT NULL REFERENCES users(uid),
                    cid  TEXT NOT NULL DEFAULT '',
                    role TEXT NOT NULL,
                    text TEXT NOT NULL,
                    ts   TEXT NOT NULL
                )""")
            async with db.execute("PRAGMA table_info(messages)") as cur:
                mcols = {r[1] for r in await cur.fetchall()}
            if "cid" not in mcols:
                await db.execute("ALTER TABLE messages ADD COLUMN cid TEXT NOT NULL DEFAULT ''")
            await db.execute("""
                CREATE TABLE IF NOT EXISTS task_cards (
                    card_id    TEXT NOT NULL,
                    uid        INTEGER NOT NULL REFERENCES users(uid),
                    data       TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (card_id, uid)
                )""")
            await db.execute("""
                CREATE TABLE IF NOT EXISTS group_messages (
                    id       TEXT PRIMARY KEY,
                    room_id  TEXT NOT NULL,
                    uid      INTEGER NOT NULL,
                    username TEXT NOT NULL,
                    text     TEXT NOT NULL,
                    ts       TEXT NOT NULL,
                    kind     TEXT NOT NULL DEFAULT ''
                )""")
            # Add kind column if upgrading from an older schema
            async with db.execute("PRAGMA table_info(group_messages)") as cur:
                cols = {r[1] for r in await cur.fetchall()}
            if "kind" not in cols:
                await db.execute("ALTER TABLE group_messages ADD COLUMN kind TEXT NOT NULL DEFAULT ''")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_group_messages_room ON group_messages(room_id, ts)")
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_llm_config (
                    uid                INTEGER PRIMARY KEY REFERENCES users(uid),
                    provider           TEXT NOT NULL,
                    model              TEXT NOT NULL,
                    api_key_ciphertext TEXT NOT NULL,
                    updated_at         TEXT NOT NULL
                )""")
            await db.commit()
        logger.info("UserDB initialised at %s", self._path)

    async def insert_user(self, username: str, email: str, hashed_password: str) -> int:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self._path) as db:
            cur = await db.execute(
                "INSERT INTO users (username, email, hashed_password, created_at) VALUES (?, ?, ?, ?)",
                (username, email, hashed_password, now),
            )
            uid = cur.lastrowid
            await db.execute("INSERT OR IGNORE INTO profiles (uid, updated_at) VALUES (?, ?)", (uid, now))
            await db.commit()
            return uid

    async def get_by_email(self, email: str) -> tuple[UserRow, str] | None:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT uid, username, email, hashed_password, participant_type FROM users WHERE email = ?",
                (email,),
            ) as cur:
                row = await cur.fetchone()
                if row is None:
                    return None
                return (
                    UserRow(row["uid"], row["username"], row["email"], row["participant_type"]),
                    row["hashed_password"],
                )

    async def get_by_uid(self, uid: int) -> UserRow | None:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT uid, username, email, participant_type FROM users WHERE uid = ?", (uid,)
            ) as cur:
                row = await cur.fetchone()
                return None if row is None else UserRow(
                    row["uid"], row["username"], row["email"], row["participant_type"]
                )

    async def get_by_github_id(self, github_id: str) -> UserRow | None:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT uid, username, email, participant_type FROM users WHERE github_id = ?",
                (github_id,),
            ) as cur:
                row = await cur.fetchone()
                return None if row is None else UserRow(
                    row["uid"], row["username"], row["email"], row["participant_type"]
                )

    async def link_github(self, uid: int, github_id: str) -> None:
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                "UPDATE users SET github_id = ? WHERE uid = ?",
                (github_id, uid),
            )
            await db.commit()

    async def insert_github_user(self, username: str, email: str,
                                  github_id: str, unusable_hash: str) -> int:
        """Create a user who signs in via GitHub only (no password)."""
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self._path) as db:
            cur = await db.execute(
                """INSERT INTO users (username, email, hashed_password, created_at, github_id)
                   VALUES (?, ?, ?, ?, ?)""",
                (username, email, unusable_hash, now, github_id),
            )
            uid = cur.lastrowid
            await db.execute(
                "INSERT OR IGNORE INTO profiles (uid, updated_at) VALUES (?, ?)",
                (uid, now),
            )
            await db.commit()
            return uid

    async def get_all(self) -> list[UserRow]:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT uid, username, email, participant_type FROM users") as cur:
                return [
                    UserRow(r["uid"], r["username"], r["email"], r["participant_type"])
                    for r in await cur.fetchall()
                ]

    async def get_profile(self, uid: int) -> ProfileRow | None:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT p.uid, p.name, p.bio, p.skills, p.location,
                       p.availability, p.updated_at, p.rating_avg, p.rating_count,
                       u.participant_type
                FROM profiles p JOIN users u ON u.uid = p.uid
                WHERE p.uid = ?
            """, (uid,)) as cur:
                row = await cur.fetchone()
                if row is None:
                    return None
                return ProfileRow(uid=row["uid"], name=row["name"], bio=row["bio"],
                                  skills=row["skills"], location=row["location"],
                                  availability=bool(row["availability"]),
                                  updated_at=row["updated_at"],
                                  rating_avg=row["rating_avg"],
                                  rating_count=row["rating_count"] or 0,
                                  participant_type=row["participant_type"])

    async def upsert_profile(self, uid: int, name: str = None, bio: str = None,
                             skills: str = None, location: str = None,
                             availability: bool = None) -> ProfileRow:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM profiles WHERE uid = ?", (uid,)) as cur:
                row = await cur.fetchone()
            if row is None:
                await db.execute("INSERT OR IGNORE INTO profiles (uid, updated_at) VALUES (?, ?)", (uid, now))
                cur_name, cur_bio, cur_skills, cur_loc, cur_avail = "", "", "", "", 1
            else:
                cur_name, cur_bio = row["name"], row["bio"]
                cur_skills, cur_loc, cur_avail = row["skills"], row["location"], row["availability"]
            n  = name         if name         is not None else cur_name
            b  = bio          if bio          is not None else cur_bio
            sk = skills       if skills       is not None else cur_skills
            lo = location     if location     is not None else cur_loc
            av = int(availability) if availability is not None else cur_avail
            await db.execute(
                """INSERT INTO profiles (uid, name, bio, skills, location, availability, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(uid) DO UPDATE SET name=excluded.name, bio=excluded.bio,
                     skills=excluded.skills, location=excluded.location,
                     availability=excluded.availability, updated_at=excluded.updated_at""",
                (uid, n, b, sk, lo, av, now),
            )
            await db.commit()
        return ProfileRow(uid=uid, name=n, bio=b, skills=sk, location=lo,
                          availability=bool(av), updated_at=now)

    async def get_all_profiles(self, exclude_uid: int = -1) -> list[ProfileRow]:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT p.uid, p.name, p.bio, p.skills, p.location,
                       p.availability, p.updated_at, p.rating_avg, p.rating_count,
                       u.participant_type
                FROM profiles p JOIN users u ON u.uid = p.uid
                WHERE p.uid != ?
            """, (exclude_uid,)) as cur:
                return [
                    ProfileRow(uid=r["uid"], name=r["name"], bio=r["bio"],
                               skills=r["skills"], location=r["location"],
                               availability=bool(r["availability"]),
                               updated_at=r["updated_at"],
                               rating_avg=r["rating_avg"],
                               rating_count=r["rating_count"] or 0,
                               participant_type=r["participant_type"])
                    for r in await cur.fetchall()
                ]

    async def search_profiles(self, query: str, exclude_uid: int = -1,
                               limit: int = 50) -> list[ProfileRow]:
        """FTS5 search on skills+bio, availability-filtered. Falls back to full scan."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            rows = []
            if query.strip():
                safe_q = " OR ".join(re.findall(r'\w+', query))
                if safe_q:
                    try:
                        async with db.execute("""
                            SELECT p.uid, p.name, p.bio, p.skills, p.location,
                                   p.availability, p.updated_at,
                                   p.rating_avg, p.rating_count, u.participant_type
                            FROM profiles p
                            JOIN users u ON u.uid = p.uid
                            JOIN profiles_fts f ON f.rowid = p.uid
                            WHERE profiles_fts MATCH ? AND p.uid != ? AND p.availability = 1
                            ORDER BY f.rank
                            LIMIT ?
                        """, (safe_q, exclude_uid, limit)) as cur:
                            rows = await cur.fetchall()
                    except Exception:
                        logger.warning("FTS search failed, falling back to availability scan")
            if not rows:
                async with db.execute("""
                    SELECT p.uid, p.name, p.bio, p.skills, p.location,
                           p.availability, p.updated_at, p.rating_avg, p.rating_count,
                           u.participant_type
                    FROM profiles p JOIN users u ON u.uid = p.uid
                    WHERE p.uid != ? AND p.availability = 1 LIMIT ?
                """, (exclude_uid, limit)) as cur:
                    rows = await cur.fetchall()
            return [
                ProfileRow(uid=r["uid"], name=r["name"], bio=r["bio"],
                           skills=r["skills"], location=r["location"],
                           availability=bool(r["availability"]),
                           updated_at=r["updated_at"],
                           rating_avg=r["rating_avg"],
                           rating_count=r["rating_count"] or 0,
                           participant_type=r["participant_type"])
                for r in rows
            ]

    async def insert_agent(self, username: str, skills: str = "", bio: str = "") -> tuple[int, str]:
        """Create an agent account. Returns (uid, openclaw_token). No password — token is the credential."""
        import secrets as _secrets
        now   = datetime.now(timezone.utc).isoformat()
        token = _secrets.token_urlsafe(32)
        async with aiosqlite.connect(self._path) as db:
            cur = await db.execute(
                """INSERT INTO users
                       (username, email, hashed_password, created_at, participant_type, openclaw_token)
                   VALUES (?, ?, '!!agent', ?, 'agent', ?)""",
                (username, f"{username}@agent.local", now, token),
            )
            uid = cur.lastrowid
            await db.execute(
                "INSERT OR IGNORE INTO profiles (uid, bio, skills, availability, updated_at) VALUES (?,?,?,1,?)",
                (uid, bio, skills, now),
            )
            await db.commit()
        return uid, token

    # ------------------------------------------------------------------
    # Ratings
    # ------------------------------------------------------------------

    async def submit_rating(self, cid: str, rater_uid: int, rated_uid: int,
                             score: int, comment: str = "") -> bool:
        """Save a rating. Returns False if this pair already rated for this task."""
        if not 1 <= score <= 5:
            return False
        now = datetime.now(timezone.utc).isoformat()
        rid = str(uuid.uuid4())
        async with aiosqlite.connect(self._path) as db:
            try:
                await db.execute(
                    """INSERT INTO ratings (id, cid, rater_uid, rated_uid, score, comment, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (rid, cid, rater_uid, rated_uid, score, comment, now),
                )
            except aiosqlite.IntegrityError:
                return False
            async with db.execute(
                "SELECT AVG(CAST(score AS REAL)), COUNT(*) FROM ratings WHERE rated_uid=?",
                (rated_uid,),
            ) as cur:
                row = await cur.fetchone()
            await db.execute(
                "UPDATE profiles SET rating_avg=?, rating_count=? WHERE uid=?",
                (row[0], row[1], rated_uid),
            )
            await db.commit()
        logger.info("Rating saved cid=%s rater=%d rated=%d score=%d", cid, rater_uid, rated_uid, score)
        return True

    # ------------------------------------------------------------------
    # Messages
    # ------------------------------------------------------------------

    async def save_message(self, uid: int, id: str, role: str,
                            text: str, ts: str, cid: str = "") -> None:
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO messages (id, uid, cid, role, text, ts) VALUES (?,?,?,?,?,?)",
                (id, uid, cid or "", role, text, ts),
            )
            await db.commit()

    async def delete_orphan_messages(self, uid: int) -> int:
        async with aiosqlite.connect(self._path) as db:
            cur = await db.execute(
                "DELETE FROM messages WHERE uid=? AND (cid IS NULL OR cid='')", (uid,),
            )
            await db.commit()
            return cur.rowcount

    async def get_messages(self, uid: int) -> list[dict]:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id, cid, role, text, ts FROM messages WHERE uid=? ORDER BY ts ASC", (uid,)
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    # ------------------------------------------------------------------
    # Task cards
    # ------------------------------------------------------------------

    async def save_task_card(self, uid: int, card_id: str, data: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """INSERT INTO task_cards (card_id, uid, data, updated_at) VALUES (?,?,?,?)
                   ON CONFLICT(card_id, uid) DO UPDATE SET data=excluded.data,
                   updated_at=excluded.updated_at""",
                (card_id, uid, data, now),
            )
            await db.commit()

    async def delete_task_card(self, uid: int, card_id: str) -> None:
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                "DELETE FROM task_cards WHERE uid=? AND card_id=?", (uid, card_id)
            )
            await db.commit()

    async def get_task_cards(self, uid: int) -> list[dict]:
        import json as _json
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT data FROM task_cards WHERE uid=? ORDER BY updated_at ASC", (uid,)
            ) as cur:
                rows = await cur.fetchall()
        result = []
        for r in rows:
            try:
                result.append(_json.loads(r["data"]))
            except Exception:
                pass
        return result

    async def get_task_card(self, uid: int, card_id: str) -> dict | None:
        import json as _json
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT data FROM task_cards WHERE uid=? AND card_id=?", (uid, card_id)
            ) as cur:
                row = await cur.fetchone()
        if row is None:
            return None
        try:
            return _json.loads(row["data"])
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Group chat
    # ------------------------------------------------------------------

    async def get_room_members(self, room_id: str) -> list[dict]:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT tc.uid AS uid, u.username AS username
                   FROM task_cards tc LEFT JOIN users u ON u.uid = tc.uid
                   WHERE tc.card_id = ?""",
                (room_id,),
            ) as cur:
                return [
                    {"uid": r["uid"], "username": r["username"] or f"user_{r['uid']}"}
                    for r in await cur.fetchall()
                ]

    async def save_group_message(self, room_id: str, msg_id: str,
                                  uid: int, username: str, text: str, ts: str,
                                  kind: str = "") -> None:
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                "INSERT OR IGNORE INTO group_messages (id, room_id, uid, username, text, ts, kind) VALUES (?,?,?,?,?,?,?)",
                (msg_id, room_id, uid, username, text, ts, kind),
            )
            await db.commit()

    async def get_group_messages(self, room_id: str, limit: int = 200) -> list[dict]:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id, uid, username, text, ts, kind FROM group_messages WHERE room_id=? ORDER BY ts ASC LIMIT ?",
                (room_id, limit),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    # ------------------------------------------------------------------
    # Per-user LLM config (API key ciphertext stored; never logged)
    # ------------------------------------------------------------------

    async def get_llm_config(self, uid: int) -> LlmConfigRow | None:
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT uid, provider, model, api_key_ciphertext, updated_at FROM user_llm_config WHERE uid=?",
                (uid,),
            ) as cur:
                row = await cur.fetchone()
                if row is None:
                    return None
                return LlmConfigRow(
                    uid=row["uid"], provider=row["provider"], model=row["model"],
                    api_key_ciphertext=row["api_key_ciphertext"],
                    updated_at=row["updated_at"],
                )

    async def set_llm_config(self, uid: int, provider: str, model: str,
                              api_key_plain: str) -> LlmConfigRow:
        from user.llm_key import encrypt
        now = datetime.now(timezone.utc).isoformat()
        ct  = encrypt(api_key_plain)
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """INSERT INTO user_llm_config (uid, provider, model, api_key_ciphertext, updated_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(uid) DO UPDATE SET provider=excluded.provider,
                     model=excluded.model, api_key_ciphertext=excluded.api_key_ciphertext,
                     updated_at=excluded.updated_at""",
                (uid, provider, model, ct, now),
            )
            await db.commit()
        return LlmConfigRow(uid=uid, provider=provider, model=model,
                            api_key_ciphertext=ct, updated_at=now)

    async def delete_llm_config(self, uid: int) -> None:
        async with aiosqlite.connect(self._path) as db:
            await db.execute("DELETE FROM user_llm_config WHERE uid=?", (uid,))
            await db.commit()

    # ------------------------------------------------------------------
    # Per-user Openclaw integration token
    # ------------------------------------------------------------------

    async def get_openclaw_token(self, uid: int) -> str:
        """Return the existing token, creating one if it doesn't exist yet."""
        import secrets as _secrets
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT openclaw_token FROM users WHERE uid=?", (uid,)
            ) as cur:
                row = await cur.fetchone()
            if row is None:
                raise ValueError(f"uid {uid} not found")
            token = row["openclaw_token"]
            if not token:
                token = _secrets.token_urlsafe(32)
                await db.execute(
                    "UPDATE users SET openclaw_token=? WHERE uid=?", (token, uid)
                )
                await db.commit()
            return token

    async def rotate_openclaw_token(self, uid: int) -> str:
        """Generate and store a fresh token, invalidating the old one."""
        import secrets as _secrets
        token = _secrets.token_urlsafe(32)
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                "UPDATE users SET openclaw_token=? WHERE uid=?", (token, uid)
            )
            await db.commit()
        return token
