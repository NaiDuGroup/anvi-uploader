import { NextResponse } from "next/server";
import { clearShopSessionCookie } from "@/lib/shop/account/session";

/** `POST /api/shop/account/logout` — drops the `shop_session` cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearShopSessionCookie(res);
  return res;
}
