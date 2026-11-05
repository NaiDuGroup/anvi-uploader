import { NextRequest, NextResponse } from "next/server";
import { sendCorporateReceivedEmail } from "@/lib/email/corporateNotify";
import { alertCorporateRequest } from "@/lib/notify/staffAlerts";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { runAfter } from "@/lib/runAfter";
import { getDesignerHelpPrice, submitDesignRequest } from "@/lib/studio/designerHelpServer";
import { turnstileConfig } from "@/lib/turnstile/config";
import { guardShopTurnstile } from "@/lib/turnstile/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * «Помощь дизайнера» (mug / pen product pages, Studio gallery).
 *
 * GET → `{ priceLei, turnstileSiteKey }` for the button / dialog.
 * POST body: `designRequestSchema` + honeypot `website`. Same guards as the
 * «Pentru companii» form (its rate-limit bucket, Turnstile action
 * «corporate»); stored as a corporate request marked «Помощь дизайнера».
 * 201 `{ ok, number }`; 400 `{ error: "invalid_input", fields }`; 429; 403 `turnstile_failed`.
 */
export async function GET() {
  const priceLei = await getDesignerHelpPrice();
  return NextResponse.json({ priceLei, turnstileSiteKey: turnstileConfig().siteKey || null }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = await hitRateLimit(RATE_LIMITS.corporateRequest, ip);
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  const blocked = await guardShopTurnstile(request, "corporate");
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  try {
    const result = await submitDesignRequest(raw, { ip, userAgent: request.headers.get("user-agent") });
    if (result.kind === "spam") return NextResponse.json({ ok: true, number: null }, { status: 201, headers: NO_STORE });
    if (result.kind === "invalid") {
      return NextResponse.json({ error: "invalid_input", fields: result.errors }, { status: 400, headers: NO_STORE });
    }
    const id = result.id;
    runAfter(() => sendCorporateReceivedEmail(id));
    runAfter(() => alertCorporateRequest(id));
    return NextResponse.json({ ok: true, number: result.number }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error("[design-request] failed:", error);
    return NextResponse.json({ error: "request_failed" }, { status: 500, headers: NO_STORE });
  }
}
