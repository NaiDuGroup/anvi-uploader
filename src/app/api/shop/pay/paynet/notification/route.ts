import { NextRequest, NextResponse } from "next/server";
import { normalizePaynetNotification, paynetConfig, verifyPaynetNotificationHash } from "@/lib/shop/paynet";
import { markPaynetOrderFailed, syncPaynetOrderByPaynetOrder } from "@/lib/shop/paynetSettle";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Paynet → us: payment notification (the callback URL Paynet has on file
 * for the merchant, e.g. https://anvi.md/api/shop/pay/paynet/notification).
 *
 * 1. `Hash` header = Base64(MD5(prepared string + notification secret)) → 401 if wrong;
 * 2. `Payment.Merchant` must be our merchant code;
 * 3. the order is found by `Payment.ExternalID` (our Paynet order number);
 * 4. PAID → the payment is re-read from Paynet's API and settled only if it
 *    is paid with the order total (idempotent; e-mail + staff alert once);
 *    FAIL → `failed` unless already paid (pay again stays possible).
 *
 * 200 only after processing, so Paynet retries on our errors (500). No
 * cookies, no rate limit (Paynet retries; the Hash keeps others out).
 */
export async function POST(request: NextRequest) {
  const cfg = paynetConfig();
  if (!cfg) return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const n = normalizePaynetNotification(raw);
  if (!n) return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  if (!verifyPaynetNotificationHash(n, request.headers.get("hash"), cfg.notificationSecret)) {
    console.warn(`[paynet-notification] bad Hash (event ${n.eventId.slice(0, 32)}, order ${n.payment.externalId.slice(0, 32)})`);
    return NextResponse.json({ error: "invalid_hash" }, { status: 401, headers: NO_STORE });
  }
  if (n.payment.merchant !== cfg.merchantCode) {
    console.warn(`[paynet-notification] foreign merchant ${n.payment.merchant.slice(0, 32)}`);
    return NextResponse.json({ error: "unknown_merchant" }, { status: 400, headers: NO_STORE });
  }
  const paynetOrder = Number(n.payment.externalId);
  if (!/^\d{1,15}$/.test(n.payment.externalId) || !Number.isSafeInteger(paynetOrder)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  }
  const event = n.eventType.trim().toUpperCase();

  try {
    // Always ask Paynet itself: a PAID is settled from its answer, and a FAIL
    // that raced a later successful retry still ends up paid.
    const { result, orderId } = await syncPaynetOrderByPaynetOrder(paynetOrder);
    let failed = false;
    if (event === "FAIL" && orderId && result === "pending") failed = await markPaynetOrderFailed(orderId);
    console.info(`[paynet-notification] ${event} order ${paynetOrder} event ${n.eventId.slice(0, 32)} → ${result}${failed ? " (failed)" : ""}`);
    // An unknown order is still acknowledged: retrying it would not help.
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[paynet-notification] failed:", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500, headers: NO_STORE });
  }
}
