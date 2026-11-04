import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { loadShopOrderView } from "@/lib/shop/orders";

const NO_STORE = { "Cache-Control": "no-store" };

/** Public storefront order status by token (no costs, phone or address). 404 for studio orders. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const staff = await getSessionUser();
  if (!staff) {
    const limit = await hitRateLimit(RATE_LIMITS.shopOrder, clientIpFromHeaders(request.headers));
    if (!limit.allowed) {
      const { body, init } = rateLimitResponseInit(limit);
      return NextResponse.json(body, init);
    }
  }
  const { token } = await params;
  try {
    const view = await loadShopOrderView(token);
    if (!view) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(view, { headers: NO_STORE });
  } catch (error) {
    console.error("[shop-order] failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500, headers: NO_STORE });
  }
}
