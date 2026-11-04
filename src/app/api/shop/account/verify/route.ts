import { NextRequest, NextResponse } from "next/server";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { consumeShopLoginCode, consumeShopLoginToken } from "@/lib/shop/account/customers";
import { setShopSessionCookie } from "@/lib/shop/account/session";
import { normalizeLoginCode, safeShopNext, shopSessionSecret } from "@/lib/shop/account/tokens";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `POST /api/shop/account/verify` — `{ token }` (the e-mail link, via the
 * «/cont/verifica» page) or `{ email, code }`. On success sets the
 * `shop_session` cookie (httpOnly, signed, 30 days, this host only) and
 * answers `{ ok: true, next }`; otherwise 400 `invalid_or_expired`.
 */
export async function POST(request: NextRequest) {
  const limit = await hitRateLimit(RATE_LIMITS.shopLoginVerify, clientIpFromHeaders(request.headers));
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  type Body = { token?: unknown; email?: unknown; code?: unknown; next?: unknown } | null;
  let raw: Body;
  try {
    raw = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const secret = shopSessionSecret();
  if (!secret) return NextResponse.json({ error: "accounts_unavailable" }, { status: 503, headers: NO_STORE });
  try {
    let customer = null;
    if (typeof raw?.token === "string") {
      customer = await consumeShopLoginToken(raw.token);
    } else {
      const code = normalizeLoginCode(raw?.code);
      if (code) customer = await consumeShopLoginCode(raw?.email, code, secret);
    }
    if (!customer) return NextResponse.json({ error: "invalid_or_expired" }, { status: 400, headers: NO_STORE });
    const res = NextResponse.json({ ok: true, next: safeShopNext(raw?.next) ?? "/cont" }, { headers: NO_STORE });
    setShopSessionCookie(res, customer.id);
    return res;
  } catch (e) {
    console.error("[shop-verify] failed:", e);
    return NextResponse.json({ error: "verify_failed" }, { status: 500, headers: NO_STORE });
  }
}
