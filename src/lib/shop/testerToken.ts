import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tester pass for the storefront closed test. Staff cookies live on
 * print.anvi.md, so a staff member gets a short-lived signed link
 * (`/shop/tester?token=…`, kind `link`, 10 min) from the admin; the tester
 * route trades it for an httpOnly cookie `shop_tester` (kind `pass`, 7 days)
 * on anvi.md. The pass lets the holder use the fake `test` payment in
 * production (see `shopPaymentState`).
 *
 * Token: `v1.<kind>.<expiresAtMs>.<nonce>.<hmac>`; HMAC-SHA256 over
 * `shop-tester:v1:<kind>:<exp>:<nonce>` with `SHOP_TESTER_SECRET`
 * (falls back to `CRON_SECRET`).
 */

type Env = Readonly<Record<string, string | undefined>>;

export type ShopTesterTokenKind = "link" | "pass";

export const SHOP_TESTER_COOKIE = "shop_tester";
export const SHOP_TESTER_LINK_TTL_MS = 10 * 60 * 1000;
export const SHOP_TESTER_PASS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Signing secret, or null when none is configured (the tester pass is then off). */
export function shopTesterSecret(env: Env = process.env): string | null {
  const s = env.SHOP_TESTER_SECRET?.trim() || env.CRON_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

function mac(secret: string, kind: ShopTesterTokenKind, exp: number, nonce: string): string {
  return createHmac("sha256", secret).update(`shop-tester:v1:${kind}:${exp}:${nonce}`).digest("base64url");
}

export function signShopTesterToken(
  kind: ShopTesterTokenKind,
  secret: string,
  now: number = Date.now(),
  ttlMs: number = kind === "link" ? SHOP_TESTER_LINK_TTL_MS : SHOP_TESTER_PASS_TTL_MS,
): string {
  const exp = now + ttlMs;
  const nonce = randomBytes(9).toString("base64url");
  return `v1.${kind}.${exp}.${nonce}.${mac(secret, kind, exp, nonce)}`;
}

/** True when `token` is a valid, unexpired token of `kind` signed with `secret`. */
export function verifyShopTesterToken(
  token: string | null | undefined,
  kind: ShopTesterTokenKind,
  secret: string | null,
  now: number = Date.now(),
): boolean {
  if (!token || !secret || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 5) return false;
  const [v, k, expRaw, nonce, sig] = parts as [string, string, string, string, string];
  if (v !== "v1" || k !== kind || !/^\d{1,16}$/.test(expRaw) || !nonce) return false;
  const exp = Number(expRaw);
  if (!(exp > now)) return false;
  const want = Buffer.from(mac(secret, kind, exp, nonce));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
