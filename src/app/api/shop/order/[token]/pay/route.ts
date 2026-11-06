import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { parsePayAgainBody, restartShopPayment } from "@/lib/shop/payAgain";
import { hasShopTesterCookie } from "@/lib/shop/testerAccess";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * «Plătește acum» for an unpaid storefront order (see `restartShopPayment`):
 * `{ locale?, acceptTerms: true }` → 200 `{ payment: { provider, redirectUrl } }`,
 * 400 `terms_required` (the terms checkbox above the button), 404, 409
 * `already_paid`, 503 `payment_unavailable` / `payment_not_configured`.
 * Test payment in production only with a tester pass / staff session, as at
 * checkout. Anonymous callers share the checkout rate limit.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const staff = await getSessionUser();
  if (!staff) {
    const limit = await hitRateLimit(RATE_LIMITS.shopCheckout, clientIpFromHeaders(request.headers));
    if (!limit.allowed) {
      const { body, init } = rateLimitResponseInit(limit);
      return NextResponse.json(body, init);
    }
  }
  const { token } = await params;
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    // An empty body → no consent → 400 below.
  }
  const { locale, acceptTerms } = parsePayAgainBody(raw);
  try {
    const tester = staff != null || (await hasShopTesterCookie());
    const { status, body } = await restartShopPayment(token, locale, process.env, { tester, acceptTerms });
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[shop-pay-again] failed:", error);
    return NextResponse.json({ error: "payment_failed" }, { status: 500, headers: NO_STORE });
  }
}
