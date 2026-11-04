/**
 * Pages where the phone tab bar (`ShopBottomNav`) is hidden: they have their
 * own fixed bottom bar (add to cart / pay) at the same z-index, which the tab
 * bar would cover. The shop-mode editor (`/editor/*`) keeps the tab bar: its
 * action bar sits above it (`sticky bottom-20`).
 */
export const SHOP_OWN_BOTTOM_BAR_PREFIXES: readonly string[] = ["/p/", "/printare", "/carti-de-vizita", "/checkout", "/pay"];

/** `path` is storefront-relative («/printare» on anvi.md and print.anvi.md/shop). */
export function shopHidesBottomNav(path: string): boolean {
  return SHOP_OWN_BOTTOM_BAR_PREFIXES.some((p) =>
    p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`),
  );
}
