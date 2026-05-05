/**
 * Setup entry for the Hands&Claws channel plugin.
 *
 * Openclaw loads this during `openclaw onboard` / config resolution, separately
 * from the main runtime entry, so it must stay lightweight (no WS connections,
 * no long imports).
 *
 * SDK import paths are taken from docs.openclaw.ai/plugins/sdk-channel-plugins.
 * If the installed openclaw SDK uses different names, adjust here — the runtime
 * logic in `./hands-and-claws-client` and `./consent` stays unchanged.
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// @ts-expect-error — openclaw SDK types resolved at the host's install site
import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";

export interface HandsAndClawsAccountConfig {
  baseUrl: string;
  token: string;
}

export interface ResolvedHandsAndClawsAccount {
  accountId: string;
  baseUrl: string;
  token: string;
}

function loadAccountsFile(): Record<string, HandsAndClawsAccountConfig> {
  const path = join(homedir(), ".openclaw", "hands-and-claws.json");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { accounts?: Record<string, HandsAndClawsAccountConfig> };
    return parsed.accounts ?? {};
  } catch {
    return {};
  }
}

export function resolveAccount(_cfg: Record<string, unknown>, accountId: string): ResolvedHandsAndClawsAccount {
  // Credentials live in ~/.openclaw/hands-and-claws.json (outside openclaw's validated schema)
  const accounts = loadAccountsFile();
  const entry = accounts[accountId];
  if (!entry) throw new Error(`hands-and-claws: account "${accountId}" not found in ~/.openclaw/hands-and-claws.json`);
  if (!entry.baseUrl) throw new Error(`hands-and-claws: account "${accountId}" missing baseUrl`);
  if (!entry.token) throw new Error(`hands-and-claws: account "${accountId}" missing token`);
  return { accountId, baseUrl: entry.baseUrl, token: entry.token };
}

export function inspectAccount(cfg: Record<string, unknown>, accountId: string): { ok: boolean; summary: string } {
  try {
    const r = resolveAccount(cfg, accountId);
    return { ok: true, summary: `hands-and-claws @ ${r.baseUrl}` };
  } catch (err) {
    return { ok: false, summary: (err as Error).message };
  }
}

export default defineSetupPluginEntry({
  id: "hands-and-claws",
  setup: { resolveAccount, inspectAccount },
});
