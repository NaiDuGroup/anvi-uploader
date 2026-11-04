import { NextRequest, NextResponse } from "next/server";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { repeatAccountOrder } from "@/lib/shop/account/data";
import { getShopCustomer } from "@/lib/shop/account/session";
import { parseShopLang } from "@/lib/storefront/i18n";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `GET /api/shop/account/orders/[number]/repeat?lang=` — «Repetă comanda»:
 * the signed-in customer's order as cart lines with the same stored files
 * (`missingFiles` names those deleted since). 404 for other accounts' orders.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const me = await getShopCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const limit = await hitRateLimit(RATE_LIMITS.shopAccount, clientIpFromHeaders(request.headers));
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  const { number } = await params;
  const n = /^\d{1,9}$/.test(number) ? Number(number) : NaN;
  const out = await repeatAccountOrder(me.id, n, parseShopLang(request.nextUrl.searchParams.get("lang")));
  if (!out) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(out, { headers: NO_STORE });
}
