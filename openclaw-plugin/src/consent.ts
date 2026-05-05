import type { HandsAndClawsInbound, HandsAndClawsOutbound } from "./hands-and-claws-client.js";

export interface PendingConsent {
  cid: string;
  consentType: "data" | "task";
}

/**
 * Renders a Hands&Claws consent event as plain text. Instructs the user to reply
 * YES or NO — no native openclaw approval buttons in v0.
 */
export function renderConsentPrompt(msg: HandsAndClawsInbound): string | null {
  if (msg.type === "data_consent") {
    const m = msg as { cid: string; intent: unknown; data: unknown };
    const intent = safeStringify(m.intent);
    const data = safeStringify(m.data);
    return [
      `Hands&Claws needs your consent to share profile data. (cid: ${m.cid})`,
      `Intent: ${intent}`,
      `Data: ${data}`,
      "Reply YES to approve, NO to decline.",
    ].join("\n");
  }
  if (msg.type === "task_consent") {
    const m = msg as { cid: string; task: unknown };
    const task = safeStringify(m.task);
    return [
      `Hands&Claws is proposing a task on your behalf. (cid: ${m.cid})`,
      `Task: ${task}`,
      `room_id: ${m.cid}  (use /join ${m.cid} after accepting)`,
      "Reply YES to accept, NO to decline.",
    ].join("\n");
  }
  return null;
}

/**
 * Tracks the most recent pending consent for a user. Hands&Claws sends at most one
 * consent per user at a time in current flows; if multiple stack up we keep
 * the latest and silently drop older ones (the user can still surface them
 * again by retrying).
 */
export class ConsentTracker {
  private pending: PendingConsent | null = null;

  remember(msg: HandsAndClawsInbound): void {
    if (msg.type === "data_consent") {
      this.pending = { cid: (msg as { cid: string }).cid, consentType: "data" };
    } else if (msg.type === "task_consent") {
      this.pending = { cid: (msg as { cid: string }).cid, consentType: "task" };
    }
  }

  /**
   * If `text` is a YES/NO reply and there is a pending consent, returns the
   * consent_reply frame to send back to Hands&Claws and clears the pending slot.
   * Otherwise returns null (caller should forward as a normal user_message).
   */
  tryParseReply(text: string): HandsAndClawsOutbound | null {
    if (!this.pending) return null;
    const norm = text.trim().toLowerCase();
    let yes: boolean;
    if (norm === "yes" || norm === "y") yes = true;
    else if (norm === "no" || norm === "n") yes = false;
    else return null;
    const reply: HandsAndClawsOutbound = {
      type: "consent_reply",
      cid: this.pending.cid,
      consent_type: this.pending.consentType,
      yes,
    };
    this.pending = null;
    return reply;
  }

  clear(): void {
    this.pending = null;
  }
}

function safeStringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
