import { headers } from "next/headers";
import { SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { SHOP_CATEGORIES } from "@/lib/storefront/catalogConfig";
import { PS_CATEGORY_SLUG } from "@/lib/storefront/printShop/config";
import { PRINT_SHOP_SLUGS } from "@/lib/storefront/printShop/listing";
import { SHOP_PATH_HEADER, isShopLaunched } from "@/lib/storefront/shopHost";
import { buildShopSitemapXml, shopSitemapPaths } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

/**
 * anvi.md/sitemap.xml (the middleware rewrites it here). Served only on a shop
 * host and only once launched (`SHOP_LAUNCHED=1`); a 404 during the closed
 * test and on print.anvi.md/shop/sitemap.xml.
 */
export async function GET(): Promise<Response> {
  const onShopHost: boolean = (await headers()).get(SHOP_PATH_HEADER) != null;
  if (!onShopHost || !isShopLaunched()) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }
  // Products from the live catalog (sold-out ones keep their page); without the database: the fixed pages only.
  const catalog = await tryLoadShopCatalog("ro");
  const xml: string = buildShopSitemapXml(
    shopSitemapPaths({
      categorySlugs: [...SHOP_CATEGORIES.map((c) => c.slug), SHOP_BC_SLUG, PS_CATEGORY_SLUG],
      productSlugs: [...(catalog?.products.map((p) => p.slug) ?? []), ...PRINT_SHOP_SLUGS],
    }),
  );
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
