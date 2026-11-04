import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Any deeper storefront path no page serves (anvi.md/a/b, /cont/nimic): the
 * storefront 404 inside the shop layout. Unmatched URLs would otherwise fall
 * to the root (Next's bare 404), which print.anvi.md keeps.
 */
export default function ShopUnknownPath() {
  notFound();
}
