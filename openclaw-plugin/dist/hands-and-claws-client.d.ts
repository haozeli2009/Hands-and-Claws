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
    demand_info?: {
        uid?: number;
        name?: string;
        intent?: string;
    };
    participants?: TaskParticipant[];
    peers?: TaskParticipant[];
    [k: string]: unknown;
}
export type HandsAndClawsInbound = {
    type: "welcome";
    uid: number;
    username: string;
    openclaw_connected: boolean;
} | {
    type: "data_consent";
    cid: string;
    data: unknown;
    intent: unknown;
} | {
    type: "task_consent";
    cid: string;
    task: unknown;
} | {
    type: "status_update";
    cid?: string;
    message: string;
} | {
    type: "pipeline_step";
    cid: string;
    id: string;
    label: string;
    detail: string;
    status: string;
    extra?: {
        candidates?: Candidate[];
    };
} | {
    type: "task_card";
    card_id: string;
    role: string;
    status?: string;
    [k: string]: unknown;
} | {
    type: "thinking_update";
    cid: string;
    text: string;
} | {
    type: "rate_prompt";
    cid: string;
    rated_uid: number;
    rated_name: string;
} | {
    type: "rating_saved";
    cid: string;
    rated_uid: number;
    rating_avg: number | null;
    rating_count: number;
} | {
    type: "user_info";
    uid: number;
    username: string;
    name: string;
    bio: string;
    skills: string;
    location: string;
    availability: boolean;
    rating_avg: number | null;
    rating_count: number;
    participant_type: string;
    demand_status: "busy" | "idle";
    active_cids: string[];
    tasks: TaskCard[];
} | {
    type: "task_info";
    card: TaskCard;
} | {
    type: "task_list";
    cards: TaskCard[];
} | {
    type: "group_message";
    room_id: string;
    id: string;
    uid: number;
    username: string;
    text: string;
    ts: string;
} | {
    type: "group_history";
    room_id: string;
    messages: unknown[];
} | {
    type: "error";
    message: string;
} | {
    type: string;
    [k: string]: unknown;
};
export type HandsAndClawsOutbound = {
    type: "user_message";
    text: string;
} | {
    type: "consent_reply";
    cid: string;
    consent_type: "data" | "task";
    yes: boolean;
} | {
    type: "finish_task";
    cid: string;
    demand_uid?: number;
} | {
    type: "get_info";
} | {
    type: "get_list";
    demand: string;
} | {
    type: "get_task";
    cid?: string;
} | {
    type: "cancel";
} | {
    type: "submit_rating";
    cid: string;
    rated_uid: number;
    score: number;
    comment?: string;
} | {
    type: "group_message";
    room_id: string;
    text: string;
} | {
    type: "fetch_group";
    room_id: string;
};
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
export declare class HandsAndClawsClient {
    private readonly opts;
    private ws;
    private queue;
    private reconnectMs;
    private stopped;
    private readonly log;
    constructor(opts: HandsAndClawsClientOptions);
    start(): void;
    stop(): void;
    send(msg: HandsAndClawsOutbound): void;
    private buildUrl;
    private connect;
    private scheduleReconnect;
}
