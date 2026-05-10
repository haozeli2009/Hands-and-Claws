from __future__ import annotations
import asyncio
import logging
import uuid

from agents.delegate import Delegate
from agents.orchestrator import Orchestrator
from protocol.client import ProtocolClient
from stats.tracker import StatsTracker
from utils.llm import LLMClient
from user.db import UserDB
from user import llm_key

logger = logging.getLogger(__name__)


class Handler:
    def __init__(self, protocol: ProtocolClient, llm: LLMClient,
                 tracker: StatsTracker, user_db: UserDB) -> None:
        self.protocol     = protocol
        self.llm          = llm
        self.tracker      = tracker
        self.user_db      = user_db
        self.orchestrator = Orchestrator(protocol=protocol, llm=llm)
        self._pending:            dict[str, asyncio.Future] = {}
        self._cid_to_demand:      dict[str, int]            = {}
        self._cid_to_supply_uids: dict[str, list[int]]      = {}
        self._active_demand_tasks:       dict[int, asyncio.Task]          = {}
        self._active_orchestrator_tasks: dict[str, asyncio.Task]          = {}
        self._active_supply_tasks:       dict[tuple[str, int], asyncio.Task] = {}
        self._demand_to_cid:             dict[int, str]                   = {}

    async def _llm_for(self, uid: int) -> LLMClient:
        """Resolve the LLM client for a user — per-user config if present, else system default."""
        if not llm_key.is_enabled():
            return self.llm
        try:
            row = await self.user_db.get_llm_config(uid)
        except Exception:
            logger.exception("Failed to load per-user LLM config uid=%d", uid)
            return self.llm
        if row is None:
            return self.llm
        try:
            api_key = llm_key.decrypt(row.api_key_ciphertext)
        except Exception:
            logger.exception("Failed to decrypt LLM api key uid=%d", uid)
            return self.llm
        return LLMClient(provider=row.provider, model=row.model, api_key=api_key)

    def register_all(self) -> None:
        self.protocol.on_new_message(self._on_new_message)
        self.protocol.on_data_consent(self._on_data_consent)
        self.protocol.on_task_consent(self._on_task_consent)
        self.protocol.on_task_from_orchestrator(self._on_task_from_orchestrator)
        self.protocol.on_is_accept(self._on_is_accept)
        self.protocol.on_package_from_delegate(self._on_package_from_delegate)
        self.protocol.on_task_finish(self._on_task_finish)
        logger.info("All protocol callbacks registered.")

    # ------------------------------------------------------------------
    # Inbound: user sends a message
    # ------------------------------------------------------------------

    async def _on_new_message(self, uid: int, text: str) -> None:
        # If the Delegate is waiting for a clarification reply from this user,
        # route the message back to the ongoing demand instead of
        # starting a fresh one.
        clarify_key = f"clarify:{uid}"
        fut = self._pending.pop(clarify_key, None)
        if fut is not None and not fut.done():
            fut.set_result(text)
            logger.info("Clarify reply uid=%d routed to in-flight demand", uid)
            return

        # Cancel any still-running demand for this user before starting a new one
        existing = self._active_demand_tasks.pop(uid, None)
        if existing and not existing.done():
            existing.cancel()
        self._cancel_pipeline_for_uid(uid)

        cid = str(uuid.uuid4())
        self._demand_to_cid[uid] = cid
        self.tracker.demand_received(uid, cid)
        logger.info("New message uid=%d cid=%s", uid, cid)
        task = asyncio.create_task(
            self._run_demand(uid=uid, cid=cid, input=text),
            name=f"demand:{cid}",
        )
        self._active_demand_tasks[uid] = task

    def _cancel_pipeline_for_uid(self, uid: int) -> None:
        """Cancel orchestrator + supply tasks for the demand user's active cid."""
        cid = self._demand_to_cid.pop(uid, None)
        if not cid:
            return
        self.protocol._cancelled_cids.add(cid)
        orch = self._active_orchestrator_tasks.pop(cid, None)
        if orch and not orch.done():
            orch.cancel()
            logger.info("Orchestrator cancelled uid=%d cid=%s", uid, cid)
        for supply_uid in list(self._cid_to_supply_uids.get(cid, [])):
            stask = self._active_supply_tasks.pop((cid, supply_uid), None)
            if stask and not stask.done():
                stask.cancel()
                logger.info("Supply task cancelled supply_uid=%d cid=%s", supply_uid, cid)

    async def cancel_demand(self, uid: int) -> None:
        task = self._active_demand_tasks.pop(uid, None)
        if task and not task.done():
            task.cancel()
            logger.info("Demand cancelled by user uid=%d", uid)
        self._cancel_pipeline_for_uid(uid)

    async def _run_demand(self, uid: int, cid: str, input: str) -> None:
        try:
            llm = await self._llm_for(uid)
            delegate = Delegate(uid=uid, protocol=self.protocol, llm=llm)
            await delegate.handle_demand(cid=cid, input=input, pending=self._pending)
        except asyncio.CancelledError:
            logger.info("Demand task cancelled uid=%d cid=%s", uid, cid)
            raise
        except Exception:
            logger.exception("Demand pipeline error uid=%d cid=%s", uid, cid)
            await self.protocol._send(uid, {
                "type": "error",
                "message": "Something went wrong. Please try again.",
            })
        finally:
            self._active_demand_tasks.pop(uid, None)

    # ------------------------------------------------------------------
    # Inbound: user answered data consent YES/NO
    # ------------------------------------------------------------------

    async def _on_data_consent(self, cid: str, uid: int, yes: bool) -> None:
        key = f"consent:{cid}:{uid}"
        fut = self._pending.pop(key, None)
        if fut and not fut.done():
            fut.set_result(yes)
            if yes:
                self.tracker.consent_given(uid, cid)
            else:
                self.tracker.consent_declined(uid, cid)
            logger.info("Data consent uid=%d cid=%s yes=%s", uid, cid, yes)
        else:
            logger.warning("No pending data consent key=%s", key)

    # ------------------------------------------------------------------
    # Inbound: Delegate forwarded a consented package to the Orchestrator
    # ------------------------------------------------------------------

    async def _on_package_from_delegate(self, cid: str, uid: int,
                                         data: str, intent: str,
                                         github_context: dict | None = None) -> None:
        logger.info("Package from Delegate uid=%d cid=%s", uid, cid)
        self._cid_to_demand[cid] = uid
        task = asyncio.create_task(
            self._run_orchestrator(cid=cid, uid=uid, data=data,
                                   intent=intent, github_context=github_context),
            name=f"orchestrator:{cid}",
        )
        self._active_orchestrator_tasks[cid] = task

    async def _run_orchestrator(self, cid: str, uid: int,
                                 data: str, intent: str,
                                 github_context: dict | None = None) -> None:
        try:
            await self.orchestrator.process(
                cid=cid, uid=uid, data=data,
                intent=intent, pending=self._pending,
                github_context=github_context,
            )
        except asyncio.CancelledError:
            logger.info("Orchestrator cancelled cid=%s", cid)
            raise
        except Exception:
            logger.exception("Orchestrator pipeline error uid=%d cid=%s", uid, cid)
        finally:
            self._active_orchestrator_tasks.pop(cid, None)

    # ------------------------------------------------------------------
    # Inbound: supply-side user answered task consent
    # ------------------------------------------------------------------

    async def _on_task_consent(self, cid: str, uid: int, yes: bool) -> None:
        key = f"accept:{cid}:{uid}"
        fut = self._pending.pop(key, None)
        if fut and not fut.done():
            fut.set_result(yes)
            logger.info("Task consent uid=%d cid=%s yes=%s", uid, cid, yes)
        else:
            logger.warning("No pending task consent key=%s", key)

    # ------------------------------------------------------------------
    # Inbound: Orchestrator dispatched a task to a supply-side Delegate
    # ------------------------------------------------------------------

    async def _on_task_from_orchestrator(self, cid: str, uid: int, task: str) -> None:
        logger.info("Task from Orchestrator uid=%d cid=%s", uid, cid)
        self.tracker.match_dispatched(uid, cid)
        stask = asyncio.create_task(
            self._run_supply(uid=uid, cid=cid, task=task),
            name=f"supply:{cid}:{uid}",
        )
        self._active_supply_tasks[(cid, uid)] = stask

    async def _run_supply(self, uid: int, cid: str, task: str) -> None:
        try:
            llm = await self._llm_for(uid)
            delegate = Delegate(uid=uid, protocol=self.protocol, llm=llm)
            await delegate.handle_supply_task(
                cid=cid, task=task, pending=self._pending
            )
        except asyncio.CancelledError:
            logger.info("Supply task cancelled uid=%d cid=%s", uid, cid)
            raise
        except Exception:
            logger.exception("Supply pipeline error uid=%d cid=%s", uid, cid)
        finally:
            self._active_supply_tasks.pop((cid, uid), None)

    # ------------------------------------------------------------------
    # Inbound: supply Delegate reports accept/reject to Orchestrator
    # ------------------------------------------------------------------

    async def _on_is_accept(self, cid: str, uid: int, accepted: bool) -> None:
        key = f"isaccept:{cid}:{uid}"
        fut = self._pending.pop(key, None)
        if fut and not fut.done():
            fut.set_result(accepted)
            if accepted:
                self.tracker.supply_accepted(uid, cid)
                self._cid_to_supply_uids.setdefault(cid, []).append(uid)
            else:
                self.tracker.supply_declined(uid, cid)
            logger.info("isaccept uid=%d cid=%s accepted=%s", uid, cid, accepted)
        else:
            logger.warning("No pending isaccept key=%s", key)

    async def _on_task_finish(self, cid: str, supply_uid: int,
                               demand_uid: int | None = None) -> None:
        # Prefer demand_uid sent by frontend (resilient to restarts),
        # fall back to in-memory map
        resolved = demand_uid or self._cid_to_demand.get(cid)
        logger.info("Task finish cid=%s supply_uid=%d demand_uid=%s",
                    cid, supply_uid, resolved)
        # Update supply user's card to finished
        await self.protocol.send_task_card(supply_uid, {
            "card_id": cid, "role": "supply", "status": "finished",
        })
        # Update demand user's card: mark this participant as finished
        if resolved is not None:
            await self.protocol.send_task_card(resolved, {
                "card_id": cid, "role": "demand",
                "finished_uid": supply_uid,
            })
        else:
            logger.warning("finish_task: no demand_uid for cid=%s", cid)

        # Notify peer supply users so they see this person's status update
        for peer_uid in self._cid_to_supply_uids.get(cid, []):
            if peer_uid != supply_uid:
                await self.protocol.send_task_card(peer_uid, {
                    "card_id": cid, "role": "supply",
                    "finished_peer_uid": supply_uid,
                })

        # Drop a "task finished" card into the group chat for everyone to see
        await self.protocol.broadcast_group_message(
            cid, supply_uid,
            text="marked this task as finished",
            kind="task_finished",
        )

        # Prompt both sides to rate each other
        self.tracker.task_finished(supply_uid, cid)

        if resolved is not None:
            supply_pr = await self.user_db.get_profile(supply_uid)
            supply_name = (supply_pr.name if supply_pr and supply_pr.name
                           else f"User {supply_uid}")
            demand_pr = await self.user_db.get_profile(resolved)
            demand_name = (demand_pr.name if demand_pr and demand_pr.name
                           else f"User {resolved}")
            if supply_pr:
                self.tracker.cache_profile(
                    supply_uid, supply_pr.participant_type,
                    supply_pr.skills, supply_pr.location,
                )
            if demand_pr:
                self.tracker.cache_profile(
                    resolved, demand_pr.participant_type,
                    demand_pr.skills, demand_pr.location,
                )
            await self.protocol.send_rate_prompt(resolved, cid, supply_uid, supply_name)
            await self.protocol.send_rate_prompt(supply_uid, cid, resolved, demand_name)

    def is_demand_active(self, uid: int) -> bool:
        task = self._active_demand_tasks.get(uid)
        return task is not None and not task.done()

    def pending_count(self) -> int:
        return len(self._pending)
