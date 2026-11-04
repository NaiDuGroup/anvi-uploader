import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { signShopTesterToken, shopTesterSecret } from "@/lib/shop/testerToken";
import { shopOrigin } from "@/lib/storefront/shopHost";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Staff only: a signed 10-minute link that gives the opener a storefront
 * tester pass on anvi.md (`/shop/tester?token=…`, see `testerToken.ts`).
 * Production links point at the shop domain; previews / local dev at the
 * current origin. 503 `tester_not_configured` without a signing secret.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const secret = shopTesterSecret();
  if (!secret) return NextResponse.json({ error: "tester_not_configured" }, { status: 503, headers: NO_STORE });

  const origin = process.env.VERCEL_ENV === "production" ? shopOrigin() : request.nextUrl.origin;
  const url = `${origin}/shop/tester?token=${encodeURIComponent(signShopTesterToken("link", secret))}`;
  return NextResponse.json({ url }, { headers: NO_STORE });
}
