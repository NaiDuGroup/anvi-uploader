"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { shopPageOf } from "@/lib/shop/analytics/events";
import { trackShopEvent } from "@/lib/storefront/analytics";

/**
 * Storefront page views for the first-party funnel (`src/lib/storefront/analytics.ts`):
 * one `page_view` per page (product / category from the path), plus
 * `cart_view` on the cart and `checkout_start` on the checkout. Renders nothing.
 */
export function ShopAnalytics() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    // The browser path (anvi.md/cani, print.anvi.md/shop/cani), not the rewritten one.
    const path = window.location.pathname;
    if (last.current === path) return;
    last.current = path;
    const page = shopPageOf(path);
    trackShopEvent("page_view", { path, category: page.category, product: page.product });
    if (page.step) trackShopEvent(page.step, { path });
  }, [pathname]);
  return null;
}
