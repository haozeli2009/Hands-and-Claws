"""
Orchestrator — matching engine, coordinating requests across available members.

FTS pre-filters supply-side profiles server-side, then passes an anonymised
shortlist (aliases only, skills only) to the LLM for ranking and dispatch.
Real UIDs and PII never appear in prompts sent to user-controlled models.
"""
from __future__ import annotations
import asyncio
import json
import logging
import string

from agents.base_agent import BaseAgent
from protocol.client import ProtocolClient
from utils.llm import LLMClient
from config import Config


def _make_alias(i: int) -> str:
    """0→'Candidate A', 25→'Candidate Z', 26→'Candidate AA', …"""
    letters = string.ascii_uppercase
    if i < 26:
        return f"Candidate {letters[i]}"
    return f"Candidate {letters[i // 26 - 1]}{letters[i % 26]}"

logger = logging.getLogger(__name__)


_TOOLS = [
    {
        "name": "dispatch_task",
        "description": (
            "Send a task to a specific supply-side candidate and wait for their YES/NO. "
            "Returns True if accepted, False if declined or timed out."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate": {"type": "string",
                              "description": "The candidate alias exactly as shown (e.g. 'Candidate A')."},
                "task":      {"type": "string",
                              "description": "Clear natural-language task description."},
            },
            "required": ["candidate", "task"],
        },
    },
    {
        "name": "ask_demand_user",
        "description": (
            "Ask the demand user a short natural-language question. "
            "Use when candidates have declined and there are alternative "
            "candidates available — ask whether they want you to try others. "
            "Returns the user's reply as a string."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "One short, friendly question in natural language.",
                },
            },
            "required": ["question"],
        },
    },
]


class Orchestrator(BaseAgent):
    MAX_ASK_DEMAND = 3

    def __init__(self, protocol: ProtocolClient, llm: LLMClient):
        super().__init__(llm)
        self.protocol = protocol

    async def process(self, cid: str, uid: int, data: str,
                      intent: str, pending: dict,
                      github_context: dict | None = None) -> None:
        self._cid                  = cid
        self._uid                  = uid
        self._intent               = intent
        self._pending              = pending
        self._github_context       = github_context
        self._profile_names:   dict[int, str]    = {}
        self._username_map:    dict[int, str]     = {}
        self._profiles:        dict[int, object] = {}
        self._task_texts:      dict[int, str]    = {}
        self._accepted_parts:  list[dict]        = []   # for demand card participants
        self._accepted_supply: list[dict]        = []   # for supply card peers
        self._demand_info:     dict              = {}
        self._alias_to_uid:    dict[str, int]    = {}   # alias → real UID (server-side only)
        self._rank_done        = False
        self._thinking_parts:  list[str]         = []
        self._thinking_at_rank = 0
        self._ask_demand_count = 0
        p = self.protocol

        # Fetch demand user's own profile (curated — name + skills only sent to supply side)
        demand_pr = await p.get_profile(uid)
        demand_username = (await p.get_all_users() or [])
        demand_username_map = {u.uid: u.username for u in demand_username}

        def display_name(profile_uid: int, profile_name: str) -> str:
            return profile_name or demand_username_map.get(profile_uid) or f"User {profile_uid}"

        self._demand_info = {
            "uid":              uid,
            "name":             display_name(uid, demand_pr.name if demand_pr else ""),
            "skills":           demand_pr.skills           if demand_pr else "",
            "rating_avg":       demand_pr.rating_avg       if demand_pr else None,
            "rating_count":     demand_pr.rating_count     if demand_pr else 0,
            "participant_type": demand_pr.participant_type if demand_pr else "human",
            # bio and location intentionally omitted — not sent to supply-side models
        }

        # Stage 1: FTS pre-filter — runs server-side, no LLM, no user model involved
        await p.send_pipeline_step(cid, uid, "fetch",
                                   "Finding available users", "Scanning the registry…")
        shortlist = await p.search_profiles(
            query=f"{intent} {data}",
            exclude_uid=uid,
            limit=Config.FTS_CANDIDATE_POOL,
        )

        if not shortlist:
            await p.send_pipeline_step(cid, uid, "fetch",
                                       "No users found", "Nobody else is registered yet.", "failed")
            await p.send_status(cid=cid, uid=uid,
                                status_list="No supply-side users are registered yet. Ask others to sign up!")
            return

        # Build alias map — UIDs never leave the server in the LLM prompt
        self._alias_to_uid = {_make_alias(i): pr.uid for i, pr in enumerate(shortlist)}
        self._profiles     = {pr.uid: pr for pr in shortlist}

        # Build display names only for shortlisted UIDs
        all_users_rows = demand_username  # already fetched above
        self._username_map = {u.uid: u.username for u in all_users_rows}
        self._profile_names = {
            pr.uid: display_name(pr.uid, pr.name) for pr in shortlist
        }

        # Pipeline "fetch done" — alias + skills only; real names/uids never shown to demand user
        candidates_extra = [
            {"alias": alias, "skills": pr.skills, "available": pr.availability}
            for alias, pr in zip(self._alias_to_uid.keys(), shortlist)
        ]
        await p.send_pipeline_step(
            cid, uid, "fetch", "Users found",
            f"{len(shortlist)} available candidate{'s' if len(shortlist) != 1 else ''}",
            "done", extra={"candidates": candidates_extra},
        )

        # Stage 2: Anonymised ranking prompt — skills only, alias identifiers, no UIDs/names/locations
        await p.send_pipeline_step(cid, uid, "rank",
                                   "Comparing candidates", "Ranking profiles…")

        profile_block = "\n\n".join(
            f"{alias}\n{pr.as_anonymous_text()}"
            for alias, pr in zip(self._alias_to_uid.keys(), shortlist)
        )

        system_prompt = f"""You are the Matching Orchestrator coordinating a request across available members.

DEMAND:
  Intent:    {intent}
  Data hint: {data}

SUPPLY-SIDE CANDIDATES (skills only — use the alias to dispatch):
{profile_block}

Your job:
1. Decide how the intent breaks down.
   - If it is a single, indivisible task, dispatch to exactly ONE best-fit
     candidate.
   - If it naturally splits into distinct sub-tasks or roles (e.g. one
     person cooks, another delivers; or design + copy + build), dispatch
     each sub-task to the candidate best suited for THAT sub-task.
   - Dispatch between 1 and {Config.TOP_N_MATCHES} candidates total. Fewer
     is better when the work doesn't require more hands. Do NOT send the
     same task to multiple people.

2. For each selected candidate call dispatch_task(candidate, task) where
   `candidate` is the exact alias (e.g. "Candidate A") and `task` is the
   SPECIFIC sub-task — not the whole intent and not a copy of another
   candidate's task. Each task must stand on its own as a clear, actionable
   instruction in natural language.
   Do NOT include the demand user's private data verbatim in any task.

3. After the initial dispatches complete, review the results:
   - If a candidate declined AND there are other qualifying candidates you
     have not tried for that sub-task, call ask_demand_user with a short
     friendly question — name the alias and the sub-task, and ask whether
     to try someone else. Only ask when it is a meaningful choice.
   - If the user replies yes (or equivalent), re-dispatch that sub-task to
     the next-best remaining candidate. If they reply no, drop that sub-task.
   - Ask_demand_user at most {self.MAX_ASK_DEMAND} times per matching session.

4. After everything is settled, write a short plain-text status summary
   listing which candidates accepted or declined and for which sub-task.
   This is shown to the demand user."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": "Begin matching and dispatching now."},
        ]

        async def on_thinking(text: str):
            self._thinking_parts.append(text)
            await p.send_thinking(cid=cid, uid=uid, text=text)

        status = await self._run(messages, tools=_TOOLS, on_thinking=on_thinking)

        all_thinking = "\n\n---\n\n".join(self._thinking_parts)
        await p.send_pipeline_step(cid, uid, "complete",
                                   "Matching complete", status, "done",
                                   extra={"summary": status,
                                          "thinking": all_thinking} if all_thinking else {"summary": status})
        # Mark demand task card as matched; participants already carry status:"active"
        await p.send_task_card(uid, {
            "card_id": cid, "role": "demand",
            "intent": self._intent, "status": "matched",
            "participants": list(self._accepted_parts),
        })
        await p.send_status(cid=cid, uid=uid, status_list=status)

    async def _handle_tool_call(self, name: str, inputs: dict) -> object:
        if name == "dispatch_task":
            alias = str(inputs.get("candidate", "")).strip()
            supply_uid = self._alias_to_uid.get(alias)
            if supply_uid is None:
                return {"error": f"Unknown candidate alias: {alias!r}"}
            return await self._tool_dispatch(supply_uid, inputs["task"])
        if name == "ask_demand_user":
            return await self._tool_ask_demand(str(inputs.get("question", "")).strip())
        return {"error": f"Unknown tool: {name}"}

    async def _tool_ask_demand(self, question: str) -> str:
        """Ask the demand user a natural-language question; await their reply."""
        if not question:
            return "(empty question skipped)"
        if self._ask_demand_count >= self.MAX_ASK_DEMAND:
            return "(ask budget exhausted — proceed with best judgment)"
        self._ask_demand_count += 1

        p = self.protocol
        # Deliver the question as an agent chat bubble so the input enables.
        await p.send_status(cid=self._cid, uid=self._uid, status_list=question)

        key = f"clarify:{self._uid}"
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[key] = fut

        try:
            reply: str = await asyncio.wait_for(fut, timeout=Config.CONSENT_TIMEOUT)
        except asyncio.TimeoutError:
            self._pending.pop(key, None)
            logger.warning("Orchestrator ask_demand_user timeout uid=%d cid=%s",
                           self._uid, self._cid)
            return "(no reply — proceed with best judgment)"
        return reply

    async def _tool_dispatch(self, supply_uid: int, task: str) -> str:
        if supply_uid == self._uid:
            return json.dumps({"uid": supply_uid, "accepted": False,
                               "reason": "Cannot dispatch to the demand-side user."})

        # Mark ranking done on first dispatch
        if not self._rank_done:
            self._rank_done = True
            rank_thinking = "\n\n---\n\n".join(self._thinking_parts)
            self._thinking_at_rank = len(self._thinking_parts)
            await self.protocol.send_pipeline_step(
                self._cid, self._uid, "rank",
                "Candidates ranked", f"Top {Config.TOP_N_MATCHES} selected", "done",
                extra={"thinking": rank_thinking} if rank_thinking else None,
            )

        name = self._profile_names.get(supply_uid, f"User {supply_uid}")
        step_id = f"dispatch_{supply_uid}"
        self._task_texts[supply_uid] = task
        preview = task[:80] + ("…" if len(task) > 80 else "")

        await self.protocol.send_pipeline_step(
            self._cid, self._uid, step_id,
            f"Contacting {name}", preview, "running",
            extra={"task": task, "uid": supply_uid, "name": name},
        )

        accept_key = f"isaccept:{self._cid}:{supply_uid}"
        fut = asyncio.get_event_loop().create_future()
        self._pending[accept_key] = fut

        await self.protocol.send_task_to_delegate(cid=self._cid, uid=supply_uid, task=task)
        logger.info("Dispatched task to uid=%d [cid=%s]", supply_uid, self._cid)

        try:
            accepted: bool = await asyncio.wait_for(fut, timeout=Config.ACCEPT_TIMEOUT)
        except asyncio.TimeoutError:
            self._pending.pop(accept_key, None)
            accepted = False
            logger.warning("Accept timeout uid=%d [cid=%s]", supply_uid, self._cid)

        result_detail = "Accepted the task" if accepted else "Declined or timed out"
        result_status = "done" if accepted else "failed"
        extra: dict = {"task": task, "uid": supply_uid, "name": name, "accepted": accepted}

        if accepted:
            pr = self._profiles.get(supply_uid)
            if pr:
                profile_data = {
                    "uid":              pr.uid,
                    "name":             self._profile_names.get(pr.uid, f"User {pr.uid}"),
                    "bio":              pr.bio,
                    "skills":           pr.skills,
                    "location":         pr.location,
                    "status":           "active",
                    "task":             task,
                    "rating_avg":       pr.rating_avg,
                    "rating_count":     pr.rating_count,
                    "participant_type": pr.participant_type,
                }
                extra["profile"] = profile_data

                # Update demand card participants
                self._accepted_parts.append(profile_data)
                await self.protocol.send_task_card(self._uid, {
                    "card_id": self._cid, "role": "demand",
                    "intent": self._intent, "status": "matching",
                    "participants": list(self._accepted_parts),
                })

                # Push to existing supply users: add this new peer to their cards
                for peer_dict in self._accepted_supply:
                    peer_uid = peer_dict["uid"]
                    # peers of peer = everyone accepted so far minus themselves
                    peers_for_peer = [
                        p for p in self._accepted_supply if p["uid"] != peer_uid
                    ] + [profile_data]
                    await self.protocol.send_task_card(peer_uid, {
                        "card_id": self._cid, "role": "supply",
                        "peers": peers_for_peer,
                    })

                # Accumulate before computing peers for new supply user
                self._accepted_supply.append(profile_data)

                # New supply user's card: all existing accepted supply users are their peers
                peers_for_new = [p for p in self._accepted_supply if p["uid"] != supply_uid]
                supply_card: dict = {
                    "card_id":     self._cid,
                    "role":        "supply",
                    "intent":      self._intent,
                    "demand_uid":  self._uid,
                    "demand_info": self._demand_info,
                    "peers":       peers_for_new,
                }
                if self._github_context:
                    # Include minimal GitHub reference so frontend can show action buttons
                    supply_card["github_ref"] = {
                        k: self._github_context[k]
                        for k in ("type", "owner", "repo", "number", "url")
                        if k in self._github_context
                    }
                await self.protocol.send_task_card(supply_uid, supply_card)

        await self.protocol.send_pipeline_step(
            self._cid, self._uid, step_id,
            f"{name} {'accepted' if accepted else 'declined'}", result_detail, result_status,
            extra=extra,
        )

        return json.dumps({"uid": supply_uid, "accepted": accepted})
