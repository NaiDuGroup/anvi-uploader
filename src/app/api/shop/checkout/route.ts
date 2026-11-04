import { NextRequest, NextResponse } from "next/server";
import { runAfter } from "@/lib/runAfter";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { notifyShopOrder } from "@/lib/email/shopNotify";
import { getShopCustomer } from "@/lib/shop/account/session";
import { runShopCheckout } from "@/lib/shop/checkout";
import { hasShopTesterCookie } from "@/lib/shop/testerAccess";

const NO_STORE = { "Cache-Control": "no-store" };

/** Copying up to 50 files a line and reading the PDFs' page counts (`printPageCheck.ts`) can take a while. */
export const maxDuration = 60;

/**
 * Storefront checkout (see `src/lib/shop/checkout.ts`): re-prices the cart on
 * the server, creates one prepaid order (source 'shop') and starts the
 * payment. 201 → `{ orderId, orderNumber, publicToken, total, deliveryPrice,
 * subtotal, payment: { provider, redirectUrl } }`; 503 `payment_unavailable`
 * (no order is created) when the caller has no way to pay — production
 * without a tester pass / staff session; 503 `payment_not_configured` keeps
 * the order (pending) and still returns its token. Anonymous callers are
 * rate-limited per IP; staff sessions are not. A signed-in storefront
 * account (`shop_session`) gets the order and may reuse its stored files;
 * otherwise the order goes to the account of the checkout e-mail.
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
    const tester = staff != null || (await hasShopTesterCookie());
    const account = await getShopCustomer();
    const { status, body } = await runShopCheckout(raw, process.env, { tester, customerId: account?.id ?? null });
    // «Comanda primită» (with a «Plătește» link and a one-time login link), after the response.
    const orderId = typeof body.orderId === "string" ? body.orderId : null;
    if (orderId) runAfter(() => notifyShopOrder(orderId, "created"));
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[shop-checkout] failed:", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500, headers: NO_STORE });
  }
}
