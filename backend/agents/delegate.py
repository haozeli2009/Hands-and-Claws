"""
Delegate — per-user AI agent, reconstructed per request.

Each user on the platform has a Delegate that acts exclusively on their behalf.
The Delegate is stateless between requests; the user's profile is the persistent state.

Demand-side responsibilities:
  1. Load the user's private profile (context-only, never forwarded verbatim).
  2. Clarify the user's intent through focused natural-language follow-up questions.
  3. Extract a structured intent and propose the minimal data excerpt to share.
  4. Request the user's explicit consent before any data leaves their context.
  5. Forward the consented package to the matching engine.

Supply-side responsibilities:
  1. Receive an inbound task assignment from the matching engine.
  2. Present the task to the user and request their accept/decline decision.
  3. Report the decision back to the matching engine.

Privacy guarantee:
  The user's full private profile is visible only inside this agent's context
  for the duration of one request. Only the user-approved excerpt is forwarded,
  and only transiently — it is never stored on the server.
"""

from __future__ import annotations
import asyncio
import json
import logging

from agents.base_agent import BaseAgent
from models.profile import LocalProfile
from protocol.client import ProtocolClient
from utils.llm import LLMClient
from config import Config

logger = logging.getLogger(__name__)


class Delegate(BaseAgent):
    """Per-user AI agent — reconstructed per request."""

    def __init__(self, uid: int, protocol: ProtocolClient, llm: LLMClient):
        super().__init__(llm)
        self.uid      = uid
        self.protocol = protocol

    # ------------------------------------------------------------------
    # Demand-side pipeline
    # ------------------------------------------------------------------

    async def handle_demand(
        self,
        cid:     str,
        input:   str,
        pending: dict[str, asyncio.Future],
    ) -> None:
        """
        Full demand-side flow:
          load private profile → clarify + parse intent → request consent
          → (if approved) forward to matching engine
        `pending` is the shared dict maintained by the handler.
        """
        p = self.protocol

        # 1. Load private profile (context-only, never forwarded verbatim)
        await p.send_pipeline_step(cid, self.uid, "parse",
                                   "Analyzing your request", "Reading your profile…")
        profile_raw = await p.read_private_context(self.uid)
        profile = LocalProfile(uid=self.uid, data=profile_raw)

        # 2. Clarify + parse intent. The LLM may ask the user follow-up
        #    questions via the ask_user tool to narrow down the match.
        intent, data_excerpt = await self._clarify_and_parse(
            input=input, profile=profile, cid=cid, pending=pending,
        )
        logger.info("Delegate demand [cid=%s uid=%d] intent: %s", cid, self.uid, intent)

        # 3. Request data consent
        await p.send_pipeline_step(cid, self.uid, "consent",
                                   "Waiting for your consent", "Review data to share…")
        await p.ask_data_consent(cid=cid, uid=self.uid, data=data_excerpt, intent=intent)

        # 4. Wait for user YES/NO (Future resolved by handler on_data_consent)
        consent_key = f"consent:{cid}:{self.uid}"
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        pending[consent_key] = fut

        try:
            consented: bool = await asyncio.wait_for(
                fut, timeout=Config.CONSENT_TIMEOUT
            )
        except asyncio.TimeoutError:
            pending.pop(consent_key, None)
            logger.warning("Data consent timeout [cid=%s uid=%d]", cid, self.uid)
            await p.send_pipeline_step(cid, self.uid, "consent",
                                       "Consent timed out", "", "failed")
            return

        if not consented:
            logger.info("User declined data consent [cid=%s uid=%d]", cid, self.uid)
            await p.send_pipeline_step(cid, self.uid, "consent",
                                       "Consent declined", "", "failed")
            return

        await p.send_pipeline_step(cid, self.uid, "consent",
                                   "Consent granted", "Forwarding to matching engine…", "done")

        # Create demand-side task card
        await p.send_task_card(self.uid, {
            "card_id": cid, "role": "demand",
            "intent": intent, "status": "matching", "participants": [],
        })

        # 5. Forward consented package to the matching engine
        await p.send_package_to_orchestrator(
            cid    = cid,
            uid    = self.uid,
            data   = data_excerpt,   # only the consented excerpt, never the full profile
            intent = intent,
        )

    # ------------------------------------------------------------------
    # Supply-side pipeline
    # ------------------------------------------------------------------

    async def handle_supply_task(
        self,
        cid:     str,
        task:    str,
        pending: dict[str, asyncio.Future],
    ) -> None:
        """
        Full supply-side flow:
          receive task assignment → present to user → report accept/decline
        """
        # 1. Present task to user
        await self.protocol.ask_task_consent(
            cid  = cid,
            uid  = self.uid,
            task = task,
        )

        # 2. Wait for user YES/NO (Future resolved by handler on_task_consent)
        accept_key = f"accept:{cid}:{self.uid}"
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        pending[accept_key] = fut

        timed_out = False
        try:
            accepted: bool = await asyncio.wait_for(
                fut, timeout=Config.ACCEPT_TIMEOUT
            )
        except asyncio.TimeoutError:
            pending.pop(accept_key, None)
            accepted  = False
            timed_out = True
            logger.warning("Task consent timeout [cid=%s uid=%d]", cid, self.uid)
            # Preserve the offer so the user can act on it later from the sidebar
            await self.protocol.send_task_card(self.uid, {
                "card_id": cid, "role": "supply",
                "task": task, "status": "pending_offer",
            })

        # 3. Create supply-side task card if accepted
        if accepted:
            await self.protocol.send_task_card(self.uid, {
                "card_id": cid, "role": "supply",
                "task": task, "status": "active",
            })

        # 4. Report decision back to the matching engine (timeout counts as decline
        #    so the orchestrator can try other candidates immediately)
        await self.protocol.send_accept_to_orchestrator(
            cid      = cid,
            uid      = self.uid,
            accepted = accepted,
        )
        logger.info("Supply accept=%s timed_out=%s [cid=%s uid=%d]",
                    accepted, timed_out, cid, self.uid)
        return timed_out

    # ------------------------------------------------------------------
    # LLM helpers
    # ------------------------------------------------------------------

    MAX_CLARIFY_QUESTIONS = 3

    async def _clarify_and_parse(
        self, input: str, profile: LocalProfile, cid: str,
        pending: dict[str, asyncio.Future],
    ) -> tuple[str, str]:
        """
        Runs a natural-language clarification loop, then returns
        (intent, data_excerpt).

        The LLM may call the `ask_user` tool up to MAX_CLARIFY_QUESTIONS
        times to narrow the request before finalising. The final answer
        is a JSON blob with intent + data_excerpt.

        Privacy rule: the full profile.data is used ONLY inside the LLM
        system prompt — never forwarded verbatim.
        """
        self._cid            = cid
        self._pending        = pending
        self._orig_input     = input
        self._clarify_count  = 0
        self._thinking_parts = []

        system_prompt = f"""You are a personal agent acting on behalf of user {self.uid}.

The following is the user's PRIVATE profile. It is shown to you only to
help you understand their context. You must NOT forward it verbatim — only
extract the minimal relevant excerpt needed to fulfil their request.

PRIVATE PROFILE (do not expose in full):
{profile.data}

Your job:
  1. Understand what the user is asking for.
  2. If a detail would meaningfully change WHICH member you match them with
     (e.g. location, timing, budget, skill level, preferred approach,
     hard constraints), call the `ask_user` tool to ask a single focused
     follow-up question in natural language. Keep it short and friendly.
     Ask ONE question per tool call. Ask at most {self.MAX_CLARIFY_QUESTIONS}
     clarifying questions total — skip clarifications that don't narrow
     the match.
  3. Once you have enough information, STOP calling tools and respond
     with ONLY a valid JSON object — no prose, no markdown fences:
     {{
       "intent":       "<one sentence describing what the user needs, incorporating any clarifications>",
       "data_excerpt": "<minimal relevant data excerpt to show the user for consent>"
     }}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": input},
        ]

        tools = [{
            "name": "ask_user",
            "description": (
                "Ask the user one focused clarifying question in natural "
                "language. Use it only when the answer would meaningfully "
                "narrow which member you match them with. Returns the "
                "user's reply as a string."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "One short, specific question.",
                    },
                },
                "required": ["question"],
            },
        }]

        async def on_thinking(t: str):
            self._thinking_parts.append(t)
            await self.protocol.send_thinking(cid=cid, uid=self.uid, text=t)

        raw = await self._run(messages, tools=tools, on_thinking=on_thinking)

        try:
            clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            parsed = json.loads(clean)
            intent_out       = parsed.get("intent", input)
            data_excerpt_out = parsed.get("data_excerpt", "")
        except json.JSONDecodeError:
            intent_out, data_excerpt_out = input, ""

        extra: dict = {"intent": intent_out}
        if data_excerpt_out:
            extra["data_excerpt"] = data_excerpt_out
        if self._thinking_parts:
            extra["thinking"] = "\n\n---\n\n".join(self._thinking_parts)
        if self._clarify_count:
            extra["clarifications"] = self._clarify_count
        await self.protocol.send_pipeline_step(
            cid, self.uid, "parse", "Request analyzed", intent_out, "done", extra=extra,
        )

        return intent_out, data_excerpt_out

    async def _handle_tool_call(self, name: str, inputs: dict) -> object:
        if name == "ask_user":
            return await self._ask_user_and_wait(str(inputs.get("question", "")).strip())
        return {"error": f"Unknown tool: {name}"}

    async def _ask_user_and_wait(self, question: str) -> str:
        """Send a clarifying question to the user and await their reply."""
        if not question:
            return "(empty question skipped)"
        if self._clarify_count >= self.MAX_CLARIFY_QUESTIONS:
            return "(clarification budget exhausted — proceed with best guess)"
        self._clarify_count += 1

        p = self.protocol

        await p.send_pipeline_step(
            self._cid, self.uid, "parse",
            "Needs clarification",
            f"Waiting for your reply · question {self._clarify_count}/{self.MAX_CLARIFY_QUESTIONS}",
            "done",
        )
        await p.send_status(cid=self._cid, uid=self.uid, status_list=question)

        key = f"clarify:{self.uid}"
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[key] = fut

        try:
            reply: str = await asyncio.wait_for(fut, timeout=Config.CONSENT_TIMEOUT)
        except asyncio.TimeoutError:
            self._pending.pop(key, None)
            logger.warning("Clarify timeout uid=%d", self.uid)
            await p.send_pipeline_step(
                self._cid, self.uid, "parse",
                "Resuming analysis", "No reply — continuing with best guess", "running",
            )
            return "(no reply — proceed with best guess)"

        await p.send_pipeline_step(
            self._cid, self.uid, "parse",
            "Resuming analysis", "Incorporating your answer…", "running",
        )
        return reply
