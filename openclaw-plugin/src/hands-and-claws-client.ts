import WebSocket from "ws";

export interface Candidate {
  alias?: string;
  skills: string;
  available: boolean;
}

export interface TaskParticipant {
  uid: number;
  name?: string;
  skills?: string;
  status?: string;
  rating_avg?: number | null;
  rating_count?: number;
}

export interface TaskCard {
  card_id: string;
  role: string;
  status?: string;
  ts?: string;
  intent?: string;
  demand_uid?: number;
  demand_info?: { uid?: number; name?: string; intent?: string };
  participants?: TaskParticipant[];
  peers?: TaskParticipant[];
  [k: string]: unknown;
}

export type HandsAndClawsInbound =
  | { type: "welcome"; uid: number; username: string; openclaw_connected: boolean }
  | { type: "data_consent"; cid: string; data: unknown; intent: unknown }
  | { type: "task_consent"; cid: string; task: unknown }
  | { type: "status_update"; cid?: string; message: string }
  | { type: "pipeline_step"; cid: string; id: string; label: string; detail: string; status: string; extra?: { candidates?: Candidate[] } }
  | { type: "task_card"; card_id: string; role: string; status?: string; [k: string]: unknown }
  | { type: "thinking_update"; cid: string; text: string }
  | { type: "rate_prompt"; cid: string; rated_uid: number; rated_name: string }
  | { type: "rating_saved"; cid: string; rated_uid: number; rating_avg: number | null; rating_count: number }
  | { type: "user_info"; uid: number; username: string; name: string; bio: string; skills: string; location: string; availability: boolean; rating_avg: number | null; rating_count: number; participant_type: string; demand_status: "busy" | "idle"; active_cids: string[]; tasks: TaskCard[] }
  | { type: "task_info"; card: TaskCard }
  | { type: "task_list"; cards: TaskCard[] }
  | { type: "group_message"; room_id: string; id: string; uid: number; username: string; text: string; ts: string }
  | { type: "group_history"; room_id: string; messages: unknown[] }
  | { type: "error"; message: string }
  | { type: string; [k: string]: unknown };

export type HandsAndClawsOutbound =
  | { type: "user_message"; text: string }
  | { type: "consent_reply"; cid: string; consent_type: "data" | "task"; yes: boolean }
  | { type: "finish_task"; cid: string; demand_uid?: number }
  | { type: "get_info" }
  | { type: "get_list"; demand: string }
  | { type: "get_task"; cid?: string }
  | { type: "cancel" }
  | { type: "submit_rating"; cid: string; rated_uid: number; score: number; comment?: string }
  | { type: "group_message"; room_id: string; text: string }
  | { type: "fetch_group"; room_id: string };

export interface HandsAndClawsClientOptions {
  baseUrl: string;
  token: string;
  onMessage: (msg: HandsAndClawsInbound) => void | Promise<void>;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: Error) => void;
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

/**
 * Self-contained WebSocket client for a Hands&Claws /ws/chat endpoint.
 *
 * Auth: JWT passed as the `token` query param (matches ws_route.py).
 * Reconnects with exponential backoff. Queues outbound frames sent before
 * the socket is open and flushes them on connect.
 */
export class HandsAndClawsClient {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private reconnectMs: number;
  private stopped = false;
  private readonly log: NonNullable<HandsAndClawsClientOptions["logger"]>;

  constructor(private readonly opts: HandsAndClawsClientOptions) {
    this.reconnectMs = opts.reconnectMinMs ?? 1000;
    this.log = opts.logger ?? console;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
  }

  send(msg: HandsAndClawsOutbound): void {
    const frame = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(frame);
    } else {
      this.queue.push(frame);
    }
  }

  private buildUrl(): string {
    const base = this.opts.baseUrl.replace(/\/$/, "");
    const wsBase = base.replace(/^http/, "ws");
    return `${wsBase}/ws/chat?token=${encodeURIComponent(this.opts.token)}`;
  }

  private connect(): void {
    const url = this.buildUrl();
    this.log.info(`[h&c] connecting ${url.split("?")[0]}`);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectMs = this.opts.reconnectMinMs ?? 1000;
      this.log.info("[h&c] connected");
      for (const frame of this.queue.splice(0)) ws.send(frame);
      this.opts.onOpen?.();
    });

    ws.on("message", (data) => {
      let parsed: HandsAndClawsInbound;
      try {
        parsed = JSON.parse(data.toString()) as HandsAndClawsInbound;
      } catch (err) {
        this.log.warn(`[h&c] bad JSON: ${(err as Error).message}`);
        return;
      }
      Promise.resolve(this.opts.onMessage(parsed)).catch((err) => {
        this.log.error(`[h&c] onMessage threw: ${(err as Error).message}`);
      });
    });

    ws.on("error", (err) => {
      this.log.warn(`[h&c] ws error: ${err.message}`);
      this.opts.onError?.(err);
    });

    ws.on("close", (code, reason) => {
      this.log.info(`[h&c] closed ${code} ${reason.toString()}`);
      this.opts.onClose?.(code, reason.toString());
      this.ws = null;
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectMs;
    const max = this.opts.reconnectMaxMs ?? 30_000;
    this.reconnectMs = Math.min(delay * 2, max);
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, delay);
  }
}
