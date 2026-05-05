"""
End-to-end matching test.

Logs in as a demand user, sends a realistic request, auto-accepts data
consent, and runs WebSocket listeners for all 17 available supply users
so their task_consent prompts are auto-accepted and the full Orchestrator dispatch
loop completes without hitting timeouts.

Usage:
    python test_matching.py [--scenario 1-5]

Scenarios:
  1  zara_chen   → wants ML engineer + backend  (default)
  2  nina_hart   → wants full-stack + UX designer
  3  amy_liu     → wants blockchain dev + technical writer
  4  kai_diallo  → wants video producer + brand designer
  5  lena_mwangi → wants DevOps engineer + data scientist
"""
import asyncio
import httpx
import json
import sys
import time
import argparse
import websockets

BASE    = "http://localhost:8000"
WS_BASE = "ws://localhost:8000"
PASSWORD = "testpass123"

SCENARIOS = {
    1: ("zara_chen",   "I need someone to help me build an ML recommendation system "
                       "— LLM fine-tuning, a RAG pipeline, and a clean Python backend API."),
    2: ("nina_hart",   "Looking for a full-stack engineer to build my SaaS dashboard "
                       "(React + REST API + Postgres) and a UX designer for the interface."),
    3: ("amy_liu",     "I need a blockchain developer to audit my DeFi smart contracts "
                       "and a technical writer to document the protocol for developers."),
    4: ("kai_diallo",  "Need a video producer to make a YouTube channel trailer and "
                       "a graphic designer for brand identity and logo for my mobile app."),
    5: ("lena_mwangi", "Need a DevOps engineer to set up my Kubernetes cluster on GCP "
                       "and a data scientist to build analytics dashboards from product telemetry."),
}

# All seeded supply users (ethan_cross is unavailable — intentionally excluded)
ALL_SUPPLY = [
    "zara_chen", "marcus_obi", "priya_nair", "tom_reeves", "yuki_tanaka",
    "alex_storm", "lena_mwangi", "ryan_walsh", "sofia_blake", "kai_diallo",
    "nina_hart", "jorge_silva", "amy_liu", "dev_patel", "claire_ford",
    "bao_nguyen", "olga_petrov",
]

R = "\033[0m"
BOLD  = "\033[1m"
DIM   = "\033[2m"
BLUE  = "\033[94m"
GREEN = "\033[92m"
MAG   = "\033[95m"
YEL   = "\033[93m"
RED   = "\033[91m"

def col(code, text): return f"{code}{text}{R}"
def ts(): return time.strftime("%H:%M:%S")

def log(tag, color, msg, indent=0):
    pad = "  " * indent
    print(f"{col(DIM, ts())}  {col(color, f'[{tag}]'):35s}  {pad}{msg}")

def log_dim(tag, color, msg, indent=0):
    log(tag, color, col(DIM, msg), indent)


def _email(username: str) -> str:
    """Convert seed username (e.g. zara_chen) to its test email."""
    return username.replace("_", ".") + "@test.hc"

async def login(username: str) -> str:
    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        r = await client.post(f"{BASE}/api/auth/login",
                              json={"email": _email(username), "password": PASSWORD})
        r.raise_for_status()
        return r.json()["token"]


async def demand_session(username: str, request: str,
                          done_evt: asyncio.Event) -> None:
    token = await login(username)
    log(username, BLUE, col(BOLD, "logged in"))
    log(username, BLUE, col(BOLD, f'request: "{request}"'))

    uri = f"{WS_BASE}/ws/chat?token={token}"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"type": "user_message", "text": request}))

        async for raw in ws:
            msg   = json.loads(raw)
            mtype = msg.get("type")

            # ── Clarifying question from Delegate ────────────────────────────
            if mtype == "status_update" and not done_evt.is_set():
                question = msg.get("message", "")
                cid      = msg.get("cid", "")
                # Check if this looks like a final summary (contains accept/decline)
                lower = question.lower()
                if any(k in lower for k in ("accepted", "declined", "matched",
                                             "no supply", "no users")):
                    log(username, BLUE, col(BOLD, f"FINAL SUMMARY:"))
                    log(username, BLUE, question, indent=1)
                    done_evt.set()
                else:
                    # It's a clarifying question — auto-reply
                    log(username, BLUE, f"Delegate asks: {question!r}")
                    reply = "No strong preference — use your best judgment."
                    log(username, BLUE, col(DIM, f"→ auto-reply: {reply!r}"))
                    await ws.send(json.dumps({"type": "user_message", "text": reply}))

            # ── Data consent ──────────────────────────────────────────────
            elif mtype == "data_consent":
                cid    = msg["cid"]
                intent = msg.get("intent", "")
                data   = msg.get("data", "")
                log(username, BLUE, f"data_consent  intent: {intent!r}")
                log_dim(username, BLUE, f"data: {json.dumps(data)[:120]}", indent=1)
                await ws.send(json.dumps({
                    "type": "consent_reply", "cid": cid,
                    "consent_type": "data", "yes": True,
                }))
                log(username, BLUE, col(BOLD, "→ data consent: YES ✓"))

            # ── Pipeline steps ────────────────────────────────────────────
            elif mtype == "pipeline_step":
                step   = msg.get("id", "?")
                label  = msg.get("label", "")
                detail = msg.get("detail", "")
                status = msg.get("status", "")
                extra  = msg.get("extra") or {}
                color  = RED if status == "failed" else (MAG if status == "done" else DIM)
                icon   = "✓" if status == "done" else ("✗" if status == "failed" else "…")
                log(username, MAG,
                    f"{col(color, icon)} [{step}] {label}" +
                    (f": {detail}" if detail else "") +
                    f"  ({status})")
                # Show candidate list
                for cand in extra.get("candidates", []):
                    avail = "✓" if cand.get("available") else "✗"
                    log_dim(username, MAG,
                        f"{cand['alias']:14s} {avail} {cand['name']:20s} "
                        f"{cand.get('skills','')[:55]}", indent=1)
                # Show thinking snippet
                thinking = extra.get("thinking", "")
                if thinking:
                    snippet = thinking.replace("\n", " ")[:200]
                    log_dim(username, MAG, f"thinking: {snippet}…", indent=1)
                # Trigger done on "complete" step
                if step == "complete" and status == "done":
                    summary = extra.get("summary", detail)
                    log(username, BLUE, col(BOLD, "MATCHING COMPLETE"))
                    log(username, BLUE, summary, indent=1)
                    done_evt.set()

            # ── Task cards ────────────────────────────────────────────────
            elif mtype == "task_card":
                role   = msg.get("role", "?")
                status = msg.get("status", "")
                parts  = msg.get("participants", [])
                log(username, BLUE,
                    f"task_card  role={role}  status={status}  "
                    f"participants={len(parts)}")
                for p in parts:
                    name = p.get("name", "?")
                    task = p.get("task", "")[:70]
                    pst  = p.get("status", "")
                    log_dim(username, BLUE,
                        f"{name:22s}  [{pst}]  {task}", indent=1)

            # ── Thinking stream ───────────────────────────────────────────
            elif mtype == "thinking_update":
                snippet = msg.get("text", "")[:120].replace("\n", " ")
                log_dim(username, DIM, f"〈thinking〉 {snippet}…")

            # ── Errors ────────────────────────────────────────────────────
            elif mtype == "error":
                log(username, RED, col(RED, f"ERROR: {msg.get('message','')}"))
                done_evt.set()

            # ── Other ─────────────────────────────────────────────────────
            else:
                log_dim(username, DIM, f"← {mtype}")

            if done_evt.is_set():
                break


async def supply_session(username: str, stop_evt: asyncio.Event) -> None:
    try:
        token = await login(username)
    except Exception as e:
        log(username, YEL, f"login failed: {e}")
        return

    uri = f"{WS_BASE}/ws/chat?token={token}"
    try:
        async with websockets.connect(uri) as ws:
            log_dim(username, GREEN, "connected")

            async def _listen():
                async for raw in ws:
                    msg   = json.loads(raw)
                    mtype = msg.get("type")

                    if mtype == "task_consent":
                        cid  = msg["cid"]
                        task = msg.get("task", "")
                        log(username, GREEN,
                            col(BOLD, f"task_consent  cid={cid[:8]}…"))
                        log_dim(username, GREEN, f'task: "{task[:100]}"', indent=1)
                        await ws.send(json.dumps({
                            "type": "consent_reply", "cid": cid,
                            "consent_type": "task", "yes": True,
                        }))
                        log(username, GREEN, col(BOLD, "→ task consent: YES ✓"))

                    elif mtype == "task_card":
                        role   = msg.get("role", "?")
                        status = msg.get("status", "")
                        log_dim(username, GREEN,
                            f"task_card  role={role}  status={status}")

                    elif mtype == "status_update":
                        log_dim(username, GREEN,
                            f"status: {msg.get('message','')[:80]}")

                    elif mtype == "error":
                        log(username, RED, f"ERROR: {msg.get('message','')}")

            done, _ = await asyncio.wait(
                [asyncio.create_task(_listen()),
                 asyncio.create_task(stop_evt.wait())],
                return_when=asyncio.FIRST_COMPLETED,
            )
    except Exception as e:
        log_dim(username, YEL, f"supply session ended: {e}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", type=int, default=1,
                        choices=list(SCENARIOS.keys()),
                        help="Test scenario 1-5")
    args = parser.parse_args()

    demand_user, request = SCENARIOS[args.scenario]
    supply_users = [u for u in ALL_SUPPLY if u != demand_user]

    print()
    print(col(BOLD, "=" * 72))
    print(col(BOLD, "  Hands&Claws — Matching Test"))
    print(col(BOLD, "=" * 72))
    print(f"  Scenario    : {args.scenario}")
    print(f"  Demand user : {col(BLUE, demand_user)}")
    print(f"  Request     : {request}")
    print(f"  Supply pool : {len(supply_users)} users (all available, ethan excluded)")
    print(col(BOLD, "=" * 72))
    print()

    done_evt = asyncio.Event()
    stop_evt = asyncio.Event()

    # Start supply listeners first
    supply_tasks = [
        asyncio.create_task(supply_session(u, stop_evt))
        for u in supply_users
    ]

    # Wait a beat for supply sessions to connect
    await asyncio.sleep(1.5)

    print()
    log("test", MAG, col(BOLD, "All supply sessions connected — firing demand request"))
    print()

    demand_task = asyncio.create_task(
        demand_session(demand_user, request, done_evt)
    )

    # Hard cap: 10 minutes
    try:
        await asyncio.wait_for(done_evt.wait(), timeout=600)
    except asyncio.TimeoutError:
        log("test", YEL, "10-minute hard cap — stopping")

    await asyncio.sleep(2)   # let final messages arrive

    print()
    print(col(BOLD, "=" * 72))
    print(col(BOLD, "  Test complete"))
    print(col(BOLD, "=" * 72))

    stop_evt.set()
    demand_task.cancel()
    for t in supply_tasks:
        t.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
