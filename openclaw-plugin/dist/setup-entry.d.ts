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
export interface HandsAndClawsAccountConfig {
    baseUrl: string;
    token: string;
}
export interface ResolvedHandsAndClawsAccount {
    accountId: string;
    baseUrl: string;
    token: string;
}
export declare function resolveAccount(_cfg: Record<string, unknown>, accountId: string): ResolvedHandsAndClawsAccount;
export declare function inspectAccount(cfg: Record<string, unknown>, accountId: string): {
    ok: boolean;
    summary: string;
};
declare const _default: any;
export default _default;
