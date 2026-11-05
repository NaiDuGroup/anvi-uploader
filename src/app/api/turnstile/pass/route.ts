import { NextRequest, NextResponse } from "next/server";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import {
  TURNSTILE_ERROR,
  TURNSTILE_PASS_COOKIE,
  TURNSTILE_PASS_TTL_SEC,
  turnstileConfig,
} from "@/lib/turnstile/config";
import { signTurnstilePass, verifyTurnstile } from "@/lib/turnstile/verify";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `POST /api/turnstile/pass` `{ token?, unavailable? }` — walk-in uploader
 * (`TURNSTILE_PROTECT_UPLOADER=1`): checks one Turnstile token and sets a
 * signed 2-hour `anvi_ts_pass` cookie that `/api/upload-url` and
 * `/api/orders` accept, so one order with many files needs one check.
 *
 * Fail-open by design (walk-in clients must never be blocked): Cloudflare
 * unreachable from the server, or the browser reporting it could not load
 * the Turnstile script (`unavailable: true`), still gets the pass (logged).
 * Only an explicitly invalid token is refused (403 `turnstile_failed`).
 * Protection off → `{ ok: true, enabled: false }`, no cookie.
 */
export async function POST(request: NextRequest) {
  const cfg = turnstileConfig();
  if (!cfg.protectUploader || !cfg.secretKey) {
    return NextResponse.json({ ok: true, enabled: false }, { headers: NO_STORE });
  }
  const ip = clientIpFromHeaders(request.headers);
  const limit = await hitRateLimit(RATE_LIMITS.uploadUrl, ip);
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  const raw = (await request.json().catch(() => null)) as { token?: unknown; unavailable?: unknown } | null;
  const token = typeof raw?.token === "string" ? raw.token : null;
  if (!token && raw?.unavailable === true) {
    console.warn(`[turnstile] uploader: browser could not load Turnstile (ip ${ip}) — fail-open`);
  } else {
    const verdict = await verifyTurnstile(token, { secretKey: cfg.secretKey, ip, action: "upload" });
    if (!verdict.ok) {
      console.info(`[turnstile] uploader pass refused (${verdict.reason})`);
      return NextResponse.json({ error: TURNSTILE_ERROR }, { status: 403, headers: NO_STORE });
    }
  }
  const res = NextResponse.json({ ok: true, enabled: true }, { headers: NO_STORE });
  res.cookies.set(TURNSTILE_PASS_COOKIE, signTurnstilePass(cfg.secretKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TURNSTILE_PASS_TTL_SEC,
  });
  return res;
}
