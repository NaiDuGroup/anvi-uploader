import "server-only";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { SHOP_TESTER_COOKIE, shopTesterSecret, verifyShopTesterToken } from "./testerToken";

/** The request carries a valid `shop_tester` pass cookie. */
export async function hasShopTesterCookie(): Promise<boolean> {
  const store = await cookies();
  return verifyShopTesterToken(store.get(SHOP_TESTER_COOKIE)?.value, "pass", shopTesterSecret());
}

/**
 * Caller may test the storefront in production (fake payment): a tester pass
 * on anvi.md, or a staff session (print.anvi.md/shop).
 */
export async function hasShopTesterAccess(): Promise<boolean> {
  if (await hasShopTesterCookie()) return true;
  return (await getSessionUser()) != null;
}
