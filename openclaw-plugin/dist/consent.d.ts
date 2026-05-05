import type { HandsAndClawsInbound, HandsAndClawsOutbound } from "./hands-and-claws-client.js";
export interface PendingConsent {
    cid: string;
    consentType: "data" | "task";
}
/**
 * Renders a Hands&Claws consent event as plain text. Instructs the user to reply
 * YES or NO — no native openclaw approval buttons in v0.
 */
export declare function renderConsentPrompt(msg: HandsAndClawsInbound): string | null;
/**
 * Tracks the most recent pending consent for a user. Hands&Claws sends at most one
 * consent per user at a time in current flows; if multiple stack up we keep
 * the latest and silently drop older ones (the user can still surface them
 * again by retrying).
 */
export declare class ConsentTracker {
    private pending;
    remember(msg: HandsAndClawsInbound): void;
    /**
     * If `text` is a YES/NO reply and there is a pending consent, returns the
     * consent_reply frame to send back to Hands&Claws and clears the pending slot.
     * Otherwise returns null (caller should forward as a normal user_message).
     */
    tryParseReply(text: string): HandsAndClawsOutbound | null;
    clear(): void;
}
