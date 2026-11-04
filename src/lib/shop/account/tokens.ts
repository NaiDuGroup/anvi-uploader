import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Storefront customer accounts — pure crypto helpers (no DB, no Next APIs).
 *
 * - Login: a random link token (sent in the e-mail as `/cont/verifica?token=…`)
 *   and a 6-digit code. Only `sha256(token)` and `HMAC(secret, email+code)`
 *   are stored; both are single-use and expire (see `SHOP_LOGIN_TTL_MS`).
 * - Session: the httpOnly cookie `shop_session` = `v1.<customerId>.<expMs>.<hmac>`
 *   (HMAC-SHA256 over `shop-session:v1:<id>:<exp>`), 30 days. It is a
 *   storefront-only credential: staff (`admin_session`) and dealer
 *   (`customer_session`) sessions live in other cookies and other tables,
 *   and none of them is accepted in place of another.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const SHOP_SESSION_COOKIE = "shop_session";
export const SHOP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Login link / code from the «Intră în cont» form. */
export const SHOP_LOGIN_TTL_MS = 15 * 60 * 1000;
/** Login link inside an order e-mail (read later than a login e-mail). */
export const SHOP_ORDER_LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** Wrong codes allowed per token before it is burnt. */
export const SHOP_LOGIN_MAX_ATTEMPTS = 5;

export type ShopLoginPurpose = "login" | "order";

const DEV_SECRET = "dev-only-shop-session-secret-do-not-use";

/**
 * Signing secret for sessions and codes: `SHOP_SESSION_SECRET`, else
 * `SHOP_TESTER_SECRET`, else `CRON_SECRET` (≥ 16 chars). Outside production a
 * fixed dev secret is used; in production without one, accounts are off (null).
 */
export function shopSessionSecret(env: Env = process.env): string | null {
  const s = env.SHOP_SESSION_SECRET?.trim() || env.SHOP_TESTER_SECRET?.trim() || env.CRON_SECRET?.trim();
  if (s && s.length >= 16) return s;
  return env.NODE_ENV === "production" ? null : DEV_SECRET;
}

/** Lower-cased, trimmed e-mail, or null when it does not look like one. */
export function normalizeShopEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 200) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function hashLoginToken(token: string): string {
  return createHash("sha256").update(`shop-login:${token}`).digest("hex");
}

export function hashLoginCode(secret: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`shop-code:v1:${email}:${code}`).digest("hex");
}

/** A 6-digit code, zero-padded. */
export function newLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newLoginToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Normalise what the customer typed as a code («123 456» → «123456»); null when not 6 digits. */
export function normalizeLoginCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(d) ? d : null;
}

export interface StoredLoginToken {
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
}

/** Whether a stored token may still be used now. */
export function loginTokenUsable(t: StoredLoginToken, now: number = Date.now()): boolean {
  return t.usedAt == null && t.expiresAt.getTime() > now && t.attempts < SHOP_LOGIN_MAX_ATTEMPTS;
}

function sessionMac(secret: string, customerId: string, exp: number): string {
  return createHmac("sha256", secret).update(`shop-session:v1:${customerId}:${exp}`).digest("base64url");
}

export function signShopSession(
  customerId: string,
  secret: string,
  now: number = Date.now(),
  ttlMs: number = SHOP_SESSION_TTL_MS,
): string {
  const exp = now + ttlMs;
  return `v1.${customerId}.${exp}.${sessionMac(secret, customerId, exp)}`;
}

/** Customer id of a valid, unexpired session cookie; else null. */
export function verifyShopSession(
  value: string | null | undefined,
  secret: string | null,
  now: number = Date.now(),
): string | null {
  if (!value || !secret || value.length > 300) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [v, id, expRaw, sig] = parts as [string, string, string, string];
  if (v !== "v1" || !/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,16}$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (!(exp > now)) return null;
  const want = Buffer.from(sessionMac(secret, id, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

/**
 * Where to go after login: only storefront-relative paths under `/cont`,
 * `/comanda`, `/cos` or `/checkout` (no open redirect). Paths are written the
 * storefront way (`/shop/...` is accepted and kept).
 */
export function safeShopNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  const p = raw.startsWith("/shop/") ? raw.slice(5) : raw;
  return /^\/(cont|comanda|cos|checkout)(\/|\?|$)/.test(p) ? p : null;
}
