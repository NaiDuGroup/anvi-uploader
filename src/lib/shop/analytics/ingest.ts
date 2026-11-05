import "server-only";
import { prisma } from "@/lib/prisma";
import { SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { SHOP_LF_CATEGORY_SLUG, SHOP_LF_RULES } from "@/lib/storefront/largeFormat";
import { SHOP_PRINT_SLUG } from "@/lib/storefront/printPrices";
import { PS_CATEGORY_SLUG, PS_PRODUCTS } from "@/lib/storefront/printShop/config";
import { SHOP_UV_STICKERS_SLUG } from "@/lib/storefront/printShop/uvStickers";
import {
  SHOP_EVENTS_RETENTION_DAYS,
  isBotUserAgent,
  parseShopEventBatch,
  requestOptsOut,
  type ShopEventRow,
} from "./events";

/** Product slug → category for every storefront product page (catalog + print-shop sections). */
export type ShopProductCategoryMap = ReadonlyMap<string, string | null>;

/** The fixed (non-catalog) product pages. */
export function fixedShopProductCategories(): Map<string, string | null> {
  const m = new Map<string, string | null>();
  m.set(SHOP_BC_SLUG, "carti-de-vizita");
  m.set(SHOP_PRINT_SLUG, "printare");
  m.set(SHOP_UV_STICKERS_SLUG, PS_CATEGORY_SLUG);
  for (const p of PS_PRODUCTS) m.set(p.slug, PS_CATEGORY_SLUG);
  for (const r of Object.values(SHOP_LF_RULES)) m.set(r.slug, SHOP_LF_CATEGORY_SLUG);
  return m;
}

const MAP_TTL_MS = 10 * 60 * 1000;
let cached: { at: number; map: ShopProductCategoryMap } | null = null;

/** Known products (refreshed every 10 minutes; the fixed pages only while the catalog is unreachable). */
export async function loadShopProductCategoryMap(now: number = Date.now()): Promise<ShopProductCategoryMap> {
  if (cached && now - cached.at < MAP_TTL_MS) return cached.map;
  const m = fixedShopProductCategories();
  const catalog = await tryLoadShopCatalog("ru");
  for (const p of catalog?.products ?? []) m.set(p.slug, p.category);
  // Without a catalog, try again on the next request instead of caching a partial map.
  if (catalog) cached = { at: now, map: m };
  return m;
}

export type ShopEventIngestResult =
  | { status: "stored"; count: number }
  | { status: "skipped"; reason: "dnt" | "bot" | "empty" }
  | { status: "invalid" };

/**
 * Store one beacon batch. Nothing is stored for a Do-Not-Track / GPC
 * request or a bot user agent; the user agent and the IP are never stored.
 */
export async function ingestShopEvents(
  body: unknown,
  headers: Pick<Headers, "get">,
  deps: {
    products?: ShopProductCategoryMap;
    write?: (rows: ShopEventRow[]) => Promise<unknown>;
  } = {},
): Promise<ShopEventIngestResult> {
  if (requestOptsOut(headers)) return { status: "skipped", reason: "dnt" };
  if (isBotUserAgent(headers.get("user-agent"))) return { status: "skipped", reason: "bot" };
  const products = deps.products ?? (await loadShopProductCategoryMap());
  const rows = parseShopEventBatch(body, (slug) => (products.has(slug) ? (products.get(slug) ?? null) : undefined));
  if (rows == null) return { status: "invalid" };
  if (rows.length === 0) return { status: "skipped", reason: "empty" };
  const write = deps.write ?? ((r: ShopEventRow[]) => prisma.shopEvent.createMany({ data: r }));
  await write(rows);
  return { status: "stored", count: rows.length };
}

/** Cutoff of the retention: events created before it are deleted. */
export function shopEventsRetentionCutoff(now: Date, days: number = SHOP_EVENTS_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** Delete events older than {@link SHOP_EVENTS_RETENTION_DAYS} days; returns how many. */
export async function pruneShopEvents(now: Date = new Date()): Promise<number> {
  const res = await prisma.shopEvent.deleteMany({ where: { createdAt: { lt: shopEventsRetentionCutoff(now) } } });
  return res.count;
}
