import { NextRequest, NextResponse } from "next/server";
import { runAfter } from "@/lib/runAfter";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { notifyShopOrder } from "@/lib/email/shopNotify";
import { alertShopOrderCreated } from "@/lib/notify/staffAlerts";
import { getShopCustomer } from "@/lib/shop/account/session";
import { runShopCheckout } from "@/lib/shop/checkout";
import { hasShopTesterCookie } from "@/lib/shop/testerAccess";
import { isShopPayOnDelivery } from "@/lib/shop/payOnDelivery";
import { guardShopTurnstile } from "@/lib/turnstile/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/** Copying up to 50 files a line and reading the PDFs' page counts (`printPageCheck.ts`) can take a while. */
export const maxDuration = 60;

/**
 * Storefront checkout (see `src/lib/shop/checkout.ts`): re-prices the cart on
 * the server, creates one prepaid order (source 'shop') and starts the
 * payment (or, with «Оплата только при получении» on, none: the order goes
 * straight to work and `payment.redirectUrl` is its page). 201 → `{ orderId, orderNumber, publicToken, total, deliveryPrice,
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
  // Cloudflare Turnstile (off without its keys; staff / testers skip it).
  const blocked = await guardShopTurnstile(request, "checkout");
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  try {
    const tester = staff != null || (await hasShopTesterCookie());
    const account = await getShopCustomer();
    const payOnDelivery = await isShopPayOnDelivery();
    const { status, body } = await runShopCheckout(raw, process.env, { tester, payOnDelivery, customerId: account?.id ?? null });
    // «Comanda primită» (with a «Plătește» link and a one-time login link), after the response.
    const orderId = typeof body.orderId === "string" ? body.orderId : null;
    if (orderId) {
      runAfter(() => notifyShopOrder(orderId, "created"));
      // Staff Telegram alert: always for pay-on-delivery orders (they go straight to work);
      // for unpaid online orders only with TELEGRAM_ALERT_UNPAID_ORDERS set.
      runAfter(() => alertShopOrderCreated(orderId));
    }
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[shop-checkout] failed:", error);
    return NextResponse.json({ error: "checkout_failed" }, { status: 500, headers: NO_STORE });
  }
}
