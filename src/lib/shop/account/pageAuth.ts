import "server-only";
import { redirect } from "next/navigation";
import { getShopHref } from "@/lib/storefront/shopBase";
import { getShopCustomer } from "./session";

/** Account page guard: the signed-in customer, else a redirect to the login (`/cont?next=…`). */
export async function requireShopCustomer(next: string) {
  const me = await getShopCustomer();
  if (me) return me;
  const href = await getShopHref();
  redirect(href(`/shop/cont?next=${encodeURIComponent(next)}`));
}
