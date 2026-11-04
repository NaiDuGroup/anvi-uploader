import "server-only";
import { headers } from "next/headers";
import { shopBaseForHost, shopHref } from "./shopHost";

/** Link prefix for this request: "" on a shop host (anvi.md), "/shop" elsewhere. */
export async function getShopBase(): Promise<"" | "/shop"> {
  return shopBaseForHost((await headers()).get("host"));
}

/** `shopHref` bound to this request's host, for server components. */
export async function getShopHref(): Promise<(path: string) => string> {
  const base = await getShopBase();
  return (path: string) => shopHref(base, path);
}
