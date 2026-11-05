import { prisma } from "@/lib/prisma";

/**
 * Postgres-backed fixed-window rate limiter for anonymous public endpoints.
 *
 * In-memory counters do not work on Vercel (every serverless instance has its
 * own memory), so each hit is an atomic `INSERT … ON CONFLICT DO UPDATE` on
 * `rate_limit_hits (key, window_start)`. Fails open: if the DB call throws the
 * request is allowed, so a limiter problem never blocks a walk-in upload.
 */

export interface RateLimitRule {
  /** Route name, part of the counter key. */
  name: string;
  limit: number;
  windowMs: number;
}

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * Limits are per client IP. They are deliberately generous: walk-in clients
 * in the studio share one Wi-Fi NAT address (and mobile carriers use CGNAT),
 * so several people uploading 50–100 files each in a few minutes must fit.
 * One presign per file → 600 / 10 min. Orders: one per submit → 60 / 10 min.
 * Storefront quotes fire on every option change → 300 / 10 min.
 */
export const RATE_LIMITS = {
  uploadUrl: { name: "upload-url", limit: 600, windowMs: TEN_MINUTES },
  createOrder: { name: "orders", limit: 60, windowMs: TEN_MINUTES },
  publicQuote: { name: "public-quote", limit: 300, windowMs: TEN_MINUTES },
  /** Storefront checkout (creates an order) and the test-payment button. */
  shopCheckout: { name: "shop-checkout", limit: 20, windowMs: TEN_MINUTES },
  /** Storefront order page polls its status. */
  shopOrder: { name: "shop-order", limit: 300, windowMs: TEN_MINUTES },
  /** Storefront account: «send me a login link / code», per client IP. */
  shopLogin: { name: "shop-login", limit: 10, windowMs: TEN_MINUTES },
  /** Same, per e-mail address (the key holds a hash of the address). */
  shopLoginEmail: { name: "shop-login-email", limit: 3, windowMs: TEN_MINUTES },
  /** Storefront account: code / link verification attempts, per client IP. */
  shopLoginVerify: { name: "shop-login-verify", limit: 20, windowMs: TEN_MINUTES },
  /** Storefront account pages' API (profile, files, repeat), per client IP. */
  shopAccount: { name: "shop-account", limit: 120, windowMs: TEN_MINUTES },
  /** «Pentru companii» quote request form, per client IP. */
  corporateRequest: { name: "corporate-request", limit: 5, windowMs: TEN_MINUTES },
} satisfies Record<string, RateLimitRule>;

/** Start of the fixed window that contains `now`. */
export function windowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/** Seconds until the current window ends (for `Retry-After`), at least 1. */
export function retryAfterSeconds(now: number, windowMs: number): number {
  return Math.max(1, Math.ceil((windowStart(now, windowMs) + windowMs - now) / 1000));
}

/** Expand an IPv6 address to 8 groups; null when it is not a parseable IPv6. */
function expandIpv6(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
}

/**
 * Normalise a client address into a limiter bucket. IPv6 clients get a whole
 * /64 (one subscriber usually owns it, so rotating inside it is free); IPv4
 * and IPv4-mapped IPv6 are used as-is.
 */
export function normalizeClientIp(raw: string | null | undefined): string {
  const ip = (raw ?? "").trim().replace(/^\[|\]$/g, "");
  if (!ip) return "unknown";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (ip.includes(":")) {
    const groups = expandIpv6(ip.split("%")[0]);
    return groups ? `${groups.slice(0, 4).join(":")}::/64` : ip.toLowerCase().slice(0, 64);
  }
  return ip.slice(0, 64);
}

/** Client IP from proxy headers (Vercel sets `x-real-ip` / `x-forwarded-for`). */
export function clientIpFromHeaders(headers: Pick<Headers, "get">): string {
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) return normalizeClientIp(realIp);
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0];
  return normalizeClientIp(first);
}

export function rateLimitKey(rule: RateLimitRule, ip: string): string {
  return `${rule.name}:${ip}`;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec: number;
}

export function evaluateRateLimit(count: number, rule: RateLimitRule, now: number): RateLimitResult {
  return {
    allowed: count <= rule.limit,
    count,
    limit: rule.limit,
    retryAfterSec: retryAfterSeconds(now, rule.windowMs),
  };
}

/** Old windows are pruned opportunistically on ~1% of hits. */
const PRUNE_PROBABILITY = 0.01;
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

/** Count one hit for `ip` against `rule` and say whether it is still allowed. */
export async function hitRateLimit(
  rule: RateLimitRule,
  ip: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const key = rateLimitKey(rule, ip);
  const start = new Date(windowStart(now, rule.windowMs));
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "rate_limit_hits" ("key", "window_start", "count")
      VALUES (${key}, ${start}, 1)
      ON CONFLICT ("key", "window_start")
      DO UPDATE SET "count" = "rate_limit_hits"."count" + 1
      RETURNING "count"`;
    if (Math.random() < PRUNE_PROBABILITY) {
      const cutoff = new Date(now - PRUNE_OLDER_THAN_MS);
      await prisma.$executeRaw`DELETE FROM "rate_limit_hits" WHERE "window_start" < ${cutoff}`.catch(
        (error: unknown) => console.error("[rateLimit] prune failed:", error),
      );
    }
    return evaluateRateLimit(Number(rows[0]?.count ?? 1), rule, now);
  } catch (error) {
    console.error("[rateLimit] counter failed, allowing request:", error);
    return evaluateRateLimit(0, rule, now);
  }
}

/** Standard 429 body + headers for a rejected request. */
export function rateLimitResponseInit(result: RateLimitResult): {
  body: { error: "rate_limited"; message: string; retryAfterSec: number };
  init: ResponseInit;
} {
  return {
    body: {
      error: "rate_limited",
      message: "Too many requests. Please wait a few minutes and try again.",
      retryAfterSec: result.retryAfterSec,
    },
    init: { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  };
}
