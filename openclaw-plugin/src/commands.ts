import type { HandsAndClawsOutbound } from "./hands-and-claws-client.js";

const HELP_TEXT = `Hands&Claws commands:
  /info                               — your uid, profile, tasks and demand status
  /getlist <demand>                   — search candidates without LLM pipeline
  /task [cid]                         — list your tasks or get full task details
  /cancel                             — stop your current demand
  /finish <cid> [demand_uid]          — mark task as finished
  /join <room_id>                     — fetch group chat history
  /msg <room_id> <text>               — send a group message
  /rate <cid> <uid> <score> [comment] — rate a participant (score 1–5)
  /help                               — show this help`;

/**
 * Parses a slash command from outbound text and returns a typed WS frame,
 * a help string (for /help), or null if not a recognised command.
 *
 * /getlist and /cancel are sent as typed frames directly — bypassing the LLM
 * pipeline entirely — instead of going through user_message.
 */
export function parseCommand(text: string): HandsAndClawsOutbound | { type: "_help"; text: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.indexOf(" ");
  const name = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  switch (name) {
    case "info":
      return { type: "get_info" };

    case "getlist": {
      const demand = args.trim();
      if (!demand) return { type: "_help", text: "Usage: /getlist <demand>" };
      return { type: "get_list", demand };
    }

    case "task": {
      const cid = args.trim();
      return cid ? { type: "get_task", cid } : { type: "get_task" };
    }

    case "cancel":
      return { type: "cancel" };

    case "finish": {
      const parts = args.split(/\s+/);
      const cid = parts[0] ?? "";
      if (!cid) return { type: "_help", text: "Usage: /finish <cid> [demand_uid]" };
      const demand_uid = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
      return {
        type: "finish_task",
        cid,
        ...(demand_uid !== undefined && !isNaN(demand_uid) ? { demand_uid } : {}),
      };
    }

    case "join": {
      const room_id = args.trim();
      if (!room_id) return { type: "_help", text: "Usage: /join <room_id>" };
      return { type: "fetch_group", room_id };
    }

    case "msg": {
      const spIdx = args.indexOf(" ");
      if (spIdx === -1) return { type: "_help", text: "Usage: /msg <room_id> <text>" };
      const room_id = args.slice(0, spIdx).trim();
      const msgText = args.slice(spIdx + 1).trim();
      if (!room_id || !msgText) return { type: "_help", text: "Usage: /msg <room_id> <text>" };
      return { type: "group_message", room_id, text: msgText };
    }

    case "rate": {
      const parts = args.split(/\s+/);
      if (parts.length < 3) {
        return { type: "_help", text: "Usage: /rate <cid> <uid> <score 1-5> [comment]" };
      }
      const [cid, uid_s, score_s, ...rest] = parts;
      const rated_uid = parseInt(uid_s, 10);
      const score = parseInt(score_s, 10);
      if (isNaN(rated_uid) || isNaN(score) || score < 1 || score > 5) {
        return { type: "_help", text: "Usage: /rate <cid> <uid> <score 1-5> [comment]" };
      }
      const comment = rest.join(" ");
      return {
        type: "submit_rating",
        cid,
        rated_uid,
        score,
        ...(comment ? { comment } : {}),
      };
    }

    case "help":
      return { type: "_help", text: HELP_TEXT };

    default:
      return null;
  }
}
