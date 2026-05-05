import WebSocket from "ws";
/**
 * Self-contained WebSocket client for a Hands&Claws /ws/chat endpoint.
 *
 * Auth: JWT passed as the `token` query param (matches ws_route.py).
 * Reconnects with exponential backoff. Queues outbound frames sent before
 * the socket is open and flushes them on connect.
 */
export class HandsAndClawsClient {
    opts;
    ws = null;
    queue = [];
    reconnectMs;
    stopped = false;
    log;
    constructor(opts) {
        this.opts = opts;
        this.reconnectMs = opts.reconnectMinMs ?? 1000;
        this.log = opts.logger ?? console;
    }
    start() {
        this.stopped = false;
        this.connect();
    }
    stop() {
        this.stopped = true;
        this.ws?.close();
        this.ws = null;
    }
    send(msg) {
        const frame = JSON.stringify(msg);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(frame);
        }
        else {
            this.queue.push(frame);
        }
    }
    buildUrl() {
        const base = this.opts.baseUrl.replace(/\/$/, "");
        const wsBase = base.replace(/^http/, "ws");
        return `${wsBase}/ws/chat?token=${encodeURIComponent(this.opts.token)}`;
    }
    connect() {
        const url = this.buildUrl();
        this.log.info(`[h&c] connecting ${url.split("?")[0]}`);
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.on("open", () => {
            this.reconnectMs = this.opts.reconnectMinMs ?? 1000;
            this.log.info("[h&c] connected");
            for (const frame of this.queue.splice(0))
                ws.send(frame);
            this.opts.onOpen?.();
        });
        ws.on("message", (data) => {
            let parsed;
            try {
                parsed = JSON.parse(data.toString());
            }
            catch (err) {
                this.log.warn(`[h&c] bad JSON: ${err.message}`);
                return;
            }
            Promise.resolve(this.opts.onMessage(parsed)).catch((err) => {
                this.log.error(`[h&c] onMessage threw: ${err.message}`);
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
            if (!this.stopped)
                this.scheduleReconnect();
        });
    }
    scheduleReconnect() {
        const delay = this.reconnectMs;
        const max = this.opts.reconnectMaxMs ?? 30_000;
        this.reconnectMs = Math.min(delay * 2, max);
        setTimeout(() => {
            if (!this.stopped)
                this.connect();
        }, delay);
    }
}
//# sourceMappingURL=hands-and-claws-client.js.map