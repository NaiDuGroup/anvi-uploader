import { NextRequest, NextResponse } from "next/server";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit } from "@/lib/rateLimit";
import { SHOP_EVENTS_MAX_BODY, isBotUserAgent, requestOptsOut } from "@/lib/shop/analytics/events";
import { ingestShopEvents } from "@/lib/shop/analytics/ingest";

const NO_STORE = { "Cache-Control": "no-store" };

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

/**
 * Storefront funnel beacon (`navigator.sendBeacon`, text/plain JSON
 * `{ events: [...] }`, ≤ 20 events; see `src/lib/shop/analytics/events.ts`).
 * No cookies are read or set; the IP is used only for the rate limit counter
 * and neither it nor the user agent is stored. DNT / GPC requests and bots
 * are dropped. Always 204 (a beacon ignores the answer) except 400 / 413 /
 * 429 for malformed, oversized or too frequent calls.
 */
export async function POST(request: NextRequest) {
  // Cheap checks first: nothing to count or parse for an opted-out browser or a bot.
  if (requestOptsOut(request.headers) || isBotUserAgent(request.headers.get("user-agent"))) return noContent();

  const limit = await hitRateLimit(RATE_LIMITS.shopEvents, clientIpFromHeaders(request.headers));
  if (!limit.allowed) {
    return new NextResponse(null, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSec) } });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > SHOP_EVENTS_MAX_BODY) return new NextResponse(null, { status: 413, headers: NO_STORE });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > SHOP_EVENTS_MAX_BODY) return new NextResponse(null, { status: 413, headers: NO_STORE });
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }

  try {
    const res = await ingestShopEvents(body, request.headers);
    if (res.status === "invalid") return new NextResponse(null, { status: 400, headers: NO_STORE });
  } catch (error) {
    // Statistics never break the shop: log and answer as usual.
    console.error("[shop-events] ingest failed:", error);
  }
  return noContent();
}
