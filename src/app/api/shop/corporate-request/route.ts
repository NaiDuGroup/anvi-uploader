import { NextRequest, NextResponse } from "next/server";
import { submitCorporateRequest } from "@/lib/corporate/requests";
import { sendCorporateReceivedEmail } from "@/lib/email/corporateNotify";
import { alertCorporateRequest } from "@/lib/notify/staffAlerts";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { runAfter } from "@/lib/runAfter";
import { guardShopTurnstile } from "@/lib/turnstile/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * «Pentru companii» quote request (anvi.md/companii). Body: the form fields
 * (`corporateRequestSchema`) + the hidden honeypot `website`.
 * 201 `{ ok, number }`; 400 `{ error: "invalid_input", fields }`; 429 when
 * the IP sent too many; 403 `turnstile_failed` when the Cloudflare Turnstile
 * check fails (off without its keys; staff / testers skip it). A filled honeypot answers like a success (`number`
 * null) and stores nothing. After the response: «Am primit cererea» e-mail
 * to the customer and the staff Telegram alert.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = await hitRateLimit(RATE_LIMITS.corporateRequest, ip);
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  // Cloudflare Turnstile (off without its keys; staff / testers skip it).
  const blocked = await guardShopTurnstile(request, "corporate");
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await submitCorporateRequest(raw, { ip, userAgent: request.headers.get("user-agent") });
    if (result.kind === "spam") {
      return NextResponse.json({ ok: true, number: null }, { status: 201, headers: NO_STORE });
    }
    if (result.kind === "invalid") {
      return NextResponse.json({ error: "invalid_input", fields: result.errors }, { status: 400, headers: NO_STORE });
    }
    const id = result.id;
    runAfter(() => sendCorporateReceivedEmail(id));
    runAfter(() => alertCorporateRequest(id));
    return NextResponse.json({ ok: true, number: result.number }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error("[corporate-request] failed:", error);
    return NextResponse.json({ error: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
