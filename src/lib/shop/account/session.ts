import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SHOP_SESSION_COOKIE, SHOP_SESSION_TTL_MS, shopSessionSecret, signShopSession, verifyShopSession } from "./tokens";

/**
 * Storefront account session (`shop_session` cookie, see `tokens.ts`). Only
 * this cookie signs a storefront customer in: staff / dealer cookies are
 * never read here, and `shop_session` is never read by `src/lib/auth.ts`.
 * The cookie is host-only (no `Domain`), so on anvi.md it stays on anvi.md.
 */

export const shopSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SHOP_SESSION_TTL_MS / 1000),
};

/** Customer id from a cookie value (verified signature + expiry). */
export function shopCustomerIdFromCookie(value: string | null | undefined): string | null {
  return verifyShopSession(value, shopSessionSecret());
}

/** The signed-in storefront customer of this request, or null. One DB read per request. */
export const getShopCustomer = cache(async () => {
  const store = await cookies();
  const id = shopCustomerIdFromCookie(store.get(SHOP_SESSION_COOKIE)?.value);
  if (!id) return null;
  return prisma.shopCustomer.findUnique({ where: { id } });
});

export function setShopSessionCookie(res: NextResponse, customerId: string): boolean {
  const secret = shopSessionSecret();
  if (!secret) return false;
  res.cookies.set(SHOP_SESSION_COOKIE, signShopSession(customerId, secret), shopSessionCookieOptions);
  return true;
}

export function clearShopSessionCookie(res: NextResponse) {
  res.cookies.set(SHOP_SESSION_COOKIE, "", { ...shopSessionCookieOptions, maxAge: 0 });
}
