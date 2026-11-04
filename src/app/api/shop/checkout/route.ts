import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { runShopCheckout } from "@/lib/shop/checkout";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Storefront checkout (see `src/lib/shop/checkout.ts`): re-prices the cart on
 * the server, creates one prepaid order (source 'shop') and starts the
 * payment. 201 → `{ orderId, orderNumber, publicToken, total, deliveryPrice,
 * subtotal, payment: { provider, redirectUrl } }`; 503 `payment_not_configured`
 * keeps the order (pending) and still returns its token. Anonymous callers
 * are rate-limited per IP; staff sessions are not.
 */
export async function POST(request: NextRequest) {
  const staff = await getSessionUser();
  if (!staff) {
    const limit = await hitRateLimit(RATE_LIMITS.shopCheckout, clientIpFromHeaders(request.headers));
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
    const { status, body } = await runShopCheckout(raw);
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[shop-checkout] failed:", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500, headers: NO_STORE });
  }
}
