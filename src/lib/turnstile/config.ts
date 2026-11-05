/**
 * Cloudflare Turnstile (invisible anti-bot check) — configuration shared by
 * server and client. Pure: no secrets leave the server (the client only ever
 * gets the public site key, passed down by `TurnstileScope`).
 *
 * Off unless BOTH `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set.
 * The walk-in uploader on print.anvi.md (`/`, `/mug`, `/pen`, `/notebook` →
 * `/api/upload-url`, `/api/orders`) is protected only with
 * `TURNSTILE_PROTECT_UPLOADER=1` on top (default off: QR walk-in clients must
 * never be blocked). Setup: `docs/turnstile-setup.md`.
 */

type Env = Record<string, string | undefined>;

/** Header the browser sends the one-time token in (keeps the JSON bodies untouched). */
export const TURNSTILE_HEADER = "x-turnstile-token";
/** Error code of a 403 answer when the check failed. */
export const TURNSTILE_ERROR = "turnstile_failed";
/** Signed «passed the check» cookie for the walk-in uploader (many upload-url calls per order). */
export const TURNSTILE_PASS_COOKIE = "anvi_ts_pass";
export const TURNSTILE_PASS_TTL_SEC = 2 * 60 * 60;
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Turnstile `action` names (shown in the Cloudflare analytics, checked on verify). */
export type TurnstileAction = "checkout" | "login" | "upload";

export interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
  /** Walk-in uploader protection (needs `enabled` too). */
  protectUploader: boolean;
}

export function turnstileConfig(env: Env = process.env): TurnstileConfig {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() || env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim() || null;
  const enabled = siteKey != null && secretKey != null;
  return {
    enabled,
    siteKey: enabled ? siteKey : null,
    secretKey: enabled ? secretKey : null,
    protectUploader: enabled && env.TURNSTILE_PROTECT_UPLOADER?.trim() === "1",
  };
}
