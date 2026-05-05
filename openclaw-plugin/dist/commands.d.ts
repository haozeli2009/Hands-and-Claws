import type { HandsAndClawsOutbound } from "./hands-and-claws-client.js";
/**
 * Parses a slash command from outbound text and returns a typed WS frame,
 * a help string (for /help), or null if not a recognised command.
 *
 * /getlist and /cancel are sent as typed frames directly — bypassing the LLM
 * pipeline entirely — instead of going through user_message.
 */
export declare function parseCommand(text: string): HandsAndClawsOutbound | {
    type: "_help";
    text: string;
} | null;
