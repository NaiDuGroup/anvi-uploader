import { NextRequest, NextResponse } from "next/server";
import {
  SHOP_TESTER_COOKIE,
  SHOP_TESTER_PASS_TTL_MS,
  shopTesterSecret,
  signShopTesterToken,
  verifyShopTesterToken,
} from "@/lib/shop/testerToken";
import { isShopHost } from "@/lib/storefront/shopHost";

export const dynamic = "force-dynamic";

/**
 * `GET /shop/tester?token=…` — trades a staff-issued 10-minute link token for
 * the 7-day `shop_tester` pass cookie (httpOnly, signed) and opens the shop.
 * An invalid / expired link just opens the shop without a pass.
 */
export async function GET(request: NextRequest) {
  const home = new URL(isShopHost(request.headers.get("host")) ? "/" : "/shop", request.url);
  const secret = shopTesterSecret();
  const token = request.nextUrl.searchParams.get("token");
  const res = NextResponse.redirect(home, 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  if (secret && verifyShopTesterToken(token, "link", secret)) {
    res.cookies.set(SHOP_TESTER_COOKIE, signShopTesterToken("pass", secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SHOP_TESTER_PASS_TTL_MS / 1000),
    });
  }
  return res;
}
