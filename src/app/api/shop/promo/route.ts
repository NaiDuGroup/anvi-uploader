import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { previewShopPromo } from "@/lib/shop/promo/promoPreview";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Checkout «Aplică»: `{ code, lines: [{ quote }], delivery: { method }, email?, locale? }`
 * → `{ ok: true, code, type, discount, subtotal, deliveryPrice, total }` or
 * `{ ok: false, reason }` (always 200 for a checked code). Unknown and
 * inactive codes answer the same `invalid`. Rate-limited per IP (code
 * guessing); staff sessions are not.
 */
export async function POST(request: NextRequest) {
  const staff = await getSessionUser();
  if (!staff) {
    const limit = await hitRateLimit(RATE_LIMITS.shopPromo, clientIpFromHeaders(request.headers));
    if (!limit.allowed) {
      const { body, init } = rateLimitResponseInit(limit);
      return NextResponse.json(body, init);
    }
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  try {
    const answer = await previewShopPromo(raw);
    if (!answer.ok && answer.reason === "invalid_input") {
      return NextResponse.json(answer, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json(answer, { headers: NO_STORE });
  } catch (error) {
    console.error("[shop-promo] failed:", error);
    return NextResponse.json({ error: "promo_failed" }, { status: 500, headers: NO_STORE });
  }
}
