import { NextRequest, NextResponse } from "next/server";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { addShopOrderLineFile } from "@/lib/shop/orderFiles";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Add the missing artwork of a DTF line zone to a storefront order (the
 * holder of its secret link): `{ line, zone, fileKey, fileName }` → 201,
 * 400 / 404 / 409 (see `addShopOrderLineFile`). Shares the checkout rate limit.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limit = await hitRateLimit(RATE_LIMITS.shopCheckout, clientIpFromHeaders(request.headers));
  if (!limit.allowed) {
    const { body, init } = rateLimitResponseInit(limit);
    return NextResponse.json(body, init);
  }
  const { token } = await params;
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  }
  try {
    const { status, body } = await addShopOrderLineFile(token, raw);
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[shop-order-file] failed:", error);
    return NextResponse.json({ error: "file_failed" }, { status: 500, headers: NO_STORE });
  }
}
