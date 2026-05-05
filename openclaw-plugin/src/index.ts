import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// @ts-expect-error — openclaw SDK types resolved at the host's install site
import { defineChannelPluginEntry, createChatChannelPlugin, createChannelPluginBase } from "openclaw/plugin-sdk/channel-core";
// @ts-expect-error
import { dispatchInboundDirectDmWithRuntime } from "openclaw/plugin-sdk/channel-inbound";
// @ts-expect-error
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

import { HandsAndClawsClient, type HandsAndClawsInbound, type Candidate, type TaskCard, type TaskParticipant } from "./hands-and-claws-client.js";
import { ConsentTracker, renderConsentPrompt } from "./consent.js";
import { parseCommand } from "./commands.js";
import { resolveAccount, inspectAccount } from "./setup-entry.js";

function loadAccountIds(): string[] {
  try {
    const raw = readFileSync(join(homedir(), ".openclaw", "hands-and-claws.json"), "utf8");
    const parsed = JSON.parse(raw) as { accounts?: Record<string, unknown> };
    return Object.keys(parsed.accounts ?? {});
  } catch {
    return [];
  }
}

// Module-scope client map so outbound handler can reach the right WS connection
const activeClients = new Map<string, HandsAndClawsClient>();
const activeConsents = new Map<string, ConsentTracker>();

// Full openclaw runtime stored on plugin registration, used in gateway.startAccount
const { setRuntime: setHandsAndClawsRuntime, getRuntime: getHandsAndClawsRuntime } =
  createPluginRuntimeStore({ pluginId: "hands-and-claws", errorMessage: "Hands & Claws runtime not initialized" });

// ── Inbound formatters ────────────────────────────────────────────────────────

function fmtParticipant(p: TaskParticipant): string {
  const name = p.name ?? `uid:${p.uid}`;
  return `${name} (uid:${p.uid}) [${p.status ?? "active"}]`;
}

function formatTaskCard(card: TaskCard): string {
  const cid     = card.card_id ?? "?";
  const role    = card.role ?? "?";
  const status  = card.status ?? "active";
  const ts      = (card.ts ?? "").slice(0, 16).replace("T", " ");
  const intent  = card.intent ?? (card.demand_info as { intent?: string } | undefined)?.intent ?? "";

  const lines: string[] = [
    `task cid: ${cid}`,
    `  role=${role} status=${status}`,
    `  room_id: ${cid}  (use /join ${cid} for group chat)`,
  ];
  if (intent) lines.push(`  intent:  ${String(intent).slice(0, 120)}`);
  if (ts)     lines.push(`  created: ${ts}`);

  const participants = card.participants ?? [];
  if (participants.length) {
    lines.push(`  supply:  ${participants.map(fmtParticipant).join(", ")}`);
  }

  const demandInfo = card.demand_info as { name?: string; uid?: number } | undefined;
  if (demandInfo) {
    lines.push(`  demand:  ${demandInfo.name ?? "?"} (uid:${demandInfo.uid})`);
  }

  const peers = card.peers ?? [];
  if (peers.length) {
    lines.push(`  peers:   ${peers.map(fmtParticipant).join(", ")}`);
  }

  return lines.join("\n");
}

function formatCandidates(candidates: Candidate[]): string {
  return candidates
    .map((c, i) => {
      const label = c.alias ?? `Candidate ${i + 1}`;
      const avail = c.available ? "available" : "away";
      const skills = c.skills ? `\n     skills: ${c.skills}` : "";
      return `  ${label} [${avail}]${skills}`;
    })
    .join("\n");
}

function formatInbound(msg: HandsAndClawsInbound, consent: ConsentTracker): string | null {
  const prompt = renderConsentPrompt(msg);
  if (prompt !== null) {
    consent.remember(msg);
    return prompt;
  }

  switch (msg.type) {
    case "welcome": {
      const m = msg as { uid: number; username: string };
      return `[h&c] connected as ${m.username} (uid:${m.uid})`;
    }

    case "status_update":
      return `[h&c] ${(msg as { message: string }).message}`;

    case "pipeline_step": {
      const m = msg as {
        label: string; detail: string; status: string;
        extra?: { candidates?: Candidate[] };
      };
      const candidates = m.extra?.candidates;
      if (candidates && candidates.length > 0) {
        return `[h&c] ${m.label}\n${formatCandidates(candidates)}`;
      }
      if (m.status === "failed") return `[h&c] ${m.label}: ${m.detail}`;
      return `[h&c] ${m.label}${m.detail ? `: ${m.detail}` : ""}`;
    }

    case "task_card": {
      const m = msg as TaskCard;
      const base = `[h&c] task cid: ${m.card_id}  role=${m.role}`;
      if (m.status) return `${base}  status=${m.status}`;
      return `${base}  (updated)`;
    }

    case "thinking_update": {
      const text = (msg as { text: string }).text;
      return text ? `[h&c thinking] ${text.slice(0, 200)}` : null;
    }

    case "rate_prompt": {
      const m = msg as { cid: string; rated_uid: number; rated_name: string };
      return [
        `[h&c] Task complete. Please rate ${m.rated_name} (uid:${m.rated_uid}).`,
        `Reply: /rate ${m.cid} ${m.rated_uid} <score 1-5> [optional comment]`,
      ].join("\n");
    }

    case "task_info": {
      const card = (msg as { card: TaskCard }).card;
      return `[h&c task info]\n${formatTaskCard(card)}`;
    }

    case "task_list": {
      const cards = (msg as { cards: TaskCard[] }).cards;
      if (!cards.length) return "[h&c] No tasks.";
      const lines = [`[h&c] ${cards.length} task(s):`];
      for (const c of cards) {
        const short  = (c.card_id ?? "?").slice(0, 8);
        const role   = c.role ?? "?";
        const status = c.status ?? "active";
        lines.push(`  ${short}… role=${role} status=${status}`);
      }
      lines.push("Use /task <cid> for full details.");
      return lines.join("\n");
    }

    case "rating_saved": {
      const m = msg as { rated_uid: number; rating_avg: number | null; rating_count: number };
      const avg = m.rating_avg !== null ? ` (avg ${m.rating_avg.toFixed(1)} over ${m.rating_count})` : "";
      return `[h&c] Rating saved for uid:${m.rated_uid}${avg}.`;
    }

    case "user_info": {
      const m = msg as {
        uid: number; username: string; name: string; bio: string;
        skills: string; location: string; availability: boolean;
        rating_avg: number | null; rating_count: number;
        participant_type: string; demand_status: string;
        active_cids: string[]; tasks: TaskCard[];
      };

      const avail  = m.availability ? "available" : "away";
      const rating = m.rating_avg !== null
        ? ` · rating ${m.rating_avg.toFixed(1)} (${m.rating_count} reviews)`
        : "";

      const lines: string[] = [
        `[h&c] /info`,
        `  uid:      ${m.uid}`,
        `  username: ${m.username}`,
        `  type:     ${m.participant_type}`,
        `  name:     ${m.name || "(none)"}`,
        `  bio:      ${m.bio || "(none)"}`,
        `  skills:   ${m.skills || "(none)"}`,
        `  location: ${m.location || "(none)"}`,
        `  avail:    ${avail}${rating}`,
        `  demand:   ${m.demand_status}`,
      ];

      if (m.active_cids.length) {
        lines.push(`  active tasks (${m.active_cids.length}):`);
        for (const cid of m.active_cids) {
          const card  = m.tasks.find(t => t.card_id === cid);
          const role  = card?.role ?? "?";
          const st    = card?.status ?? "active";
          lines.push(`    cid: ${cid}  role=${role} status=${st}`);
          lines.push(`    room_id: ${cid}  (use /join ${cid})`);
        }
      } else {
        lines.push(`  tasks:    (none active)`);
      }

      const finished = m.tasks.filter(t => t.status === "finished");
      if (finished.length) {
        lines.push(`  finished: ${finished.length} task(s) — use /task for full list`);
      }

      return lines.join("\n");
    }

    case "group_message": {
      const m = msg as { room_id: string; uid: number; username: string; text: string };
      return `[${m.room_id}] ${m.username} (uid:${m.uid}): ${m.text}`;
    }

    case "group_history":
      return null;

    case "error":
      return `[h&c error] ${(msg as { message: string }).message}`;

    default:
      return null;
  }
}

// ── Outbound sender (shared by gateway deliver + direct outbound) ──────────────

function sendToHnC(client: HandsAndClawsClient, consent: ConsentTracker | undefined, text: string): void {
  const consentReply = consent?.tryParseReply(text);
  if (consentReply) { client.send(consentReply); return; }

  const cmd = parseCommand(text);
  if (cmd && cmd.type !== "_help") {
    client.send(cmd as Parameters<typeof client.send>[0]);
    return;
  }

  client.send({ type: "user_message", text });
}

// ── Plugin definition ─────────────────────────────────────────────────────────

const handsAndClawsGatewayAdapter = {
  startAccount: async (ctx: {
    accountId: string;
    cfg: Record<string, unknown>;
    log?: { info?: (s: string) => void; warn?: (s: string) => void; error?: (s: string) => void };
    abortSignal?: AbortSignal;
    setStatus?: (status: Record<string, unknown>) => void;
  }) => {
    const runtime = getHandsAndClawsRuntime();
    const resolved = resolveAccount(ctx.cfg, ctx.accountId);
    const consent = new ConsentTracker();
    activeConsents.set(ctx.accountId, consent);

    const log = {
      info:  (msg: string) => ctx.log?.info?.(msg),
      warn:  (msg: string) => (ctx.log?.warn ?? ctx.log?.info)?.(msg),
      error: (msg: string) => (ctx.log?.error ?? ctx.log?.info)?.(msg),
    };

    const client = new HandsAndClawsClient({
      baseUrl: resolved.baseUrl,
      token: resolved.token,
      logger: log,
      onMessage: async (msg: HandsAndClawsInbound) => {
        const text = formatInbound(msg, consent);
        if (text === null) return;

        // Only messages that require an active decision from the agent are
        // dispatched through the LLM pipeline. Informational server events
        // (welcome, status_update, task_card, pipeline_step, etc.) are
        // suppressed entirely — routing them to the LLM caused every event
        // to trigger a new H&C demand request, flooding the system.
        const needsDecision = (
          msg.type === "data_consent" ||
          msg.type === "task_consent" ||
          msg.type === "rate_prompt"
        );
        if (!needsDecision) return;

        await dispatchInboundDirectDmWithRuntime({
          cfg: ctx.cfg,
          channel: "hands-and-claws",
          channelLabel: "Hands & Claws",
          accountId: ctx.accountId,
          peer: { kind: "direct", id: "server" },
          runtime,
          conversationLabel: "H&C",
          rawBody: text,
          senderAddress: "hands-and-claws:server",
          recipientAddress: `hands-and-claws:${ctx.accountId}`,
          senderId: "hands-and-claws-server",
          deliver: async (payload: { text?: string }) => {
            if (!payload.text) return;
            const activeClient = activeClients.get(ctx.accountId);
            if (!activeClient) return;
            // Only typed WS frames reach H&C — consent replies and slash
            // commands. Plain LLM text is never sent as a user_message because
            // that would re-enter the H&C demand pipeline.
            const consentReply = consent.tryParseReply(payload.text);
            if (consentReply) { activeClient.send(consentReply); return; }
            const cmd = parseCommand(payload.text);
            if (cmd && cmd.type !== "_help") {
              activeClient.send(cmd as Parameters<typeof client.send>[0]);
            }
          },
        });
      },
    });

    activeClients.set(ctx.accountId, client);
    client.start();
    ctx.setStatus?.({ running: true });

    await new Promise<void>((resolve) => {
      if (!ctx.abortSignal || ctx.abortSignal.aborted) { resolve(); return; }
      ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
    });

    client.stop();
    activeClients.delete(ctx.accountId);
    activeConsents.delete(ctx.accountId);
  },
};

const plugin = createChatChannelPlugin({
  base: {
    ...createChannelPluginBase({
      id: "hands-and-claws",
      setup: { resolveAccount, inspectAccount },

      config: {
        listAccountIds: (_cfg: Record<string, unknown>) => loadAccountIds(),
        resolveAccount: (_cfg: Record<string, unknown>, accountId: string) => ({
          accountId,
          enabled: true,
        }),
        isConfigured: (_account: unknown) => true,
        describeAccount: (account: { accountId: string }) => ({
          configured: true,
          label: `H&C (${account.accountId})`,
        }),
      },
    }),
    gateway: handsAndClawsGatewayAdapter,
  },

  outbound: {
    attachedResults: {
      channel: "hands-and-claws",
      sendText: async ({ text, accountId }: { text: string; accountId?: string }) => {
        const client = activeClients.get(accountId ?? "");
        if (client) sendToHnC(client, activeConsents.get(accountId ?? ""), text);
        return {};
      },
    },
  },
});

export default defineChannelPluginEntry({
  id: "hands-and-claws",
  name: "Hands & Claws",
  description: "Bridge to a Hands&Claws agent collaboration system",
  plugin,
  setRuntime: setHandsAndClawsRuntime,
});
