import { NextRequest, NextResponse } from "next/server";
import { runAfter } from "@/lib/runAfter";
import { notifyShopOrderByToken } from "@/lib/email/shopNotify";
import { alertShopOrderPaid } from "@/lib/notify/staffAlerts";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { markShopOrderPaid } from "@/lib/shop/orders";
import { isTestPaymentAllowed } from "@/lib/shop/paymentMode";
import { hasShopTesterCookie } from "@/lib/shop/testerAccess";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Fake payment for the storefront pilot: `{ token }` → the order is paid
 * (`paymentStatus='paid'`, `isPaid`, `paidAt`, provider 'test'). Idempotent.
 * 404 unless the caller may use the test provider (`isTestPaymentAllowed`:
 * on Vercel production only with a tester pass / staff session, or an
 * explicit `SHOP_PAYMENT_MODE=test`).
 */
export async function POST(request: NextRequest) {
  const staff = await getSessionUser();
  const tester = staff != null || (await hasShopTesterCookie());
  if (!isTestPaymentAllowed(process.env, { tester })) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  if (!staff) {
    const limit = await hitRateLimit(RATE_LIMITS.shopCheckout, clientIpFromHeaders(request.headers));
    if (!limit.allowed) {
      const { body, init } = rateLimitResponseInit(limit);
      return NextResponse.json(body, init);
    }
  }

  let token: unknown;
  try {
    token = ((await request.json()) as { token?: unknown })?.token;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await markShopOrderPaid(token, "test");
    if (result === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    // «Comanda achitată» — once, only on the call that settled it.
    const paidToken: string = token;
    if (result === "paid") {
      runAfter(() => notifyShopOrderByToken(paidToken, "paid"));
      // Staff Telegram alert, same once-only rule.
      runAfter(() => alertShopOrderPaid(paidToken));
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[shop-pay-test] failed:", error);
    return NextResponse.json({ error: "payment_failed" }, { status: 500, headers: NO_STORE });
  }
}
