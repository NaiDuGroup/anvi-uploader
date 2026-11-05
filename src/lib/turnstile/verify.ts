import { createHmac, timingSafeEqual } from "node:crypto";
import { TURNSTILE_PASS_TTL_SEC, TURNSTILE_SITEVERIFY_URL, type TurnstileAction } from "./config";

/**
 * Server-side Turnstile check (`siteverify`) — reusable from any route:
 *
 *   const v = await verifyTurnstile(request.headers.get(TURNSTILE_HEADER), { secretKey, ip, action: "login" });
 *   if (!v.ok) return 403;
 *
 * Fail-open on network trouble (timeout, Cloudflare 5xx, `internal-error`):
 * a Cloudflare outage must not stop real customers, so it is logged and let
 * through. Fail-closed on an explicit «invalid» answer or a missing token.
 * No secret key → `disabled` (everything passes).
 */

export type TurnstileVerdict =
  | { ok: true; reason: "disabled" | "verified" | "unreachable" }
  | { ok: false; reason: "missing" | "invalid"; codes?: string[] };

export interface VerifyTurnstileOptions {
  secretKey: string | null | undefined;
  ip?: string | null;
  /** When given, the token must have been issued for this action. */
  action?: TurnstileAction;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 4000;

export async function verifyTurnstile(token: string | null | undefined, opts: VerifyTurnstileOptions): Promise<TurnstileVerdict> {
  if (!opts.secretKey) return { ok: true, reason: "disabled" };
  const t = typeof token === "string" ? token.trim() : "";
  // Real tokens are < 2048 chars; anything else is not worth a round trip.
  if (!t || t.length > 2048) return { ok: false, reason: "missing" };

  const form = new URLSearchParams({ secret: opts.secretKey, response: t });
  if (opts.ip && opts.ip !== "unknown") form.set("remoteip", opts.ip);

  let data: { success?: unknown; "error-codes"?: unknown; action?: unknown };
  try {
    const res = await (opts.fetchImpl ?? fetch)(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[turnstile] siteverify HTTP ${res.status} — letting the request through`);
      return { ok: true, reason: "unreachable" };
    }
    data = (await res.json()) as typeof data;
  } catch (e) {
    console.warn("[turnstile] siteverify unreachable — letting the request through:", e instanceof Error ? e.message : e);
    return { ok: true, reason: "unreachable" };
  }

  const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].filter((c): c is string => typeof c === "string") : [];
  if (data.success === true) {
    if (opts.action && typeof data.action === "string" && data.action !== opts.action) {
      return { ok: false, reason: "invalid", codes: ["action-mismatch"] };
    }
    return { ok: true, reason: "verified" };
  }
  if (codes.includes("internal-error")) {
    console.warn("[turnstile] siteverify internal-error — letting the request through");
    return { ok: true, reason: "unreachable" };
  }
  return { ok: false, reason: "invalid", codes };
}

/* ---- «passed the check» cookie (walk-in uploader) ---- */

function passKey(secretKey: string): Buffer {
  return createHmac("sha256", secretKey).update("anvi-turnstile-pass-v1").digest();
}

function sign(exp: number, secretKey: string): string {
  return createHmac("sha256", passKey(secretKey)).update(String(exp)).digest("base64url");
}

/** Cookie value `exp.signature`, valid {@link TURNSTILE_PASS_TTL_SEC} from `nowMs`. */
export function signTurnstilePass(secretKey: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + TURNSTILE_PASS_TTL_SEC;
  return `${exp}.${sign(exp, secretKey)}`;
}

export function verifyTurnstilePass(value: string | null | undefined, secretKey: string, nowMs = Date.now()): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isInteger(exp) || exp * 1000 <= nowMs) return false;
  const want = Buffer.from(sign(exp, secretKey));
  const got = Buffer.from(value.slice(dot + 1));
  return want.length === got.length && timingSafeEqual(want, got);
}
