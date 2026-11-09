import "server-only";
import { shopLfImageBySlug } from "@/lib/storefront/largeFormat";
import { prisma } from "@/lib/prisma";
import type { ShopLang } from "@/lib/storefront/i18n";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { buildLineLabels, describeQuoteLine } from "@/lib/storefront/lineLabels";
import { shopT } from "@/lib/storefront/i18n";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { SHOP_ORDER_FILE_PREFIX } from "../constants";
import { printShopListing } from "@/lib/storefront/printShop/listing";
import { shopCustomerStatus, type ShopCustomerStatus } from "../customerStatus";
import { shopLineDescriber } from "../orders";
import { buildShopOrderView, type ShopOrderView } from "../orderView";
import { deleteShopOrderFiles } from "../shopFiles";
import { buildRepeatLines, groupCustomerFiles, orderNeedsFiles, type CustomerFile, type RepeatLine } from "./accountRules";

/**
 * Data of the storefront account pages. Every query is scoped by the
 * signed-in `customerId`: a customer only ever reads or changes their own
 * orders and files (an order of another account answers null / not_found).
 */

/** `metaStatus` is nullable: a plain `not: "missing"` would skip NULL rows. */
const NOT_PURGED = { OR: [{ metaStatus: null }, { metaStatus: { not: "missing" } }] };

const ownOrders = (customerId: string) => ({ shopCustomerId: customerId, source: "shop", deletedAt: null });

export interface AccountOrderRow {
  orderNumber: number;
  publicToken: string;
  createdAt: string;
  status: ShopCustomerStatus;
  total: number;
  trackingNumber: string | null;
  lineCount: number;
}

export async function listAccountOrders(customerId: string, take = 50): Promise<AccountOrderRow[]> {
  const rows = await prisma.order.findMany({
    where: ownOrders(customerId),
    orderBy: { createdAt: "desc" },
    take,
    select: {
      orderNumber: true,
      publicToken: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      paymentProvider: true,
      isPaid: true,
      shippedAt: true,
      price: true,
      trackingNumber: true,
      _count: { select: { orderLines: true } },
    },
  });
  return rows.map((o) => ({
    orderNumber: o.orderNumber,
    publicToken: o.publicToken,
    createdAt: o.createdAt.toISOString(),
    status: shopCustomerStatus(o),
    total: o.price != null ? Number(o.price.toString()) : 0,
    trackingNumber: o.trackingNumber,
    lineCount: o._count.orderLines,
  }));
}

export interface AccountOrderDetail {
  publicToken: string;
  view: ShopOrderView;
  files: { name: string; available: boolean }[];
}

/** One own order by its number (with line names in `lang`); null when not this customer's. */
export async function loadAccountOrder(customerId: string, orderNumber: number, lang: ShopLang): Promise<AccountOrderDetail | null> {
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) return null;
  const o = await prisma.order.findFirst({
    where: { ...ownOrders(customerId), orderNumber },
    select: {
      publicToken: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      paymentProvider: true,
      isPaid: true,
      shippedAt: true,
      price: true,
      deliveryPriceMdl: true,
      promoDiscountMdl: true,
      promoCode: true,
      promoData: true,
      deliveryMethod: true,
      deliveryCity: true,
      deliveryAddress: true,
      deliveryNote: true,
      trackingNumber: true,
      customerName: true,
      clientName: true,
      orderLines: { orderBy: { sortOrder: "asc" }, select: { shopLineData: true, files: { select: { paperType: true } } } },
      files: { orderBy: { fileName: "asc" }, select: { fileName: true, fileUrl: true, metaStatus: true } },
    },
  });
  if (!o) return null;
  const catalog = await tryLoadShopCatalog(lang);
  const describe = catalog ? shopLineDescriber(buildLineLabels(catalog.products), lang) : undefined;
  return {
    publicToken: o.publicToken,
    view: buildShopOrderView(o, describe),
    files: o.files.map((f) => ({ name: f.fileName, available: f.metaStatus !== "missing" && f.fileUrl.startsWith(SHOP_ORDER_FILE_PREFIX) })),
  };
}

/** «Repetă comanda»: the order's lines as cart lines (same files), or null when not this customer's. */
export async function repeatAccountOrder(
  customerId: string,
  orderNumber: number,
  lang: ShopLang,
): Promise<{ lines: RepeatLine[]; skipped: number } | null> {
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) return null;
  const o = await prisma.order.findFirst({
    where: { ...ownOrders(customerId), orderNumber },
    select: {
      orderLines: {
        orderBy: { sortOrder: "asc" },
        select: {
          shopLineData: true,
          files: { select: { fileUrl: true, fileName: true, paperType: true, sizeBytes: true, metaStatus: true } },
        },
      },
    },
  });
  if (!o) return null;
  const catalog = await tryLoadShopCatalog(lang);
  if (!catalog) return { lines: [], skipped: o.orderLines.length };
  const labels = buildLineLabels(catalog.products);
  // Print-shop products and business cards are not catalog items: their listing images.
  const images = new Map([...printShopListing(lang, { withHidden: true }), ...catalog.products].map((p) => [p.slug, p.image]));
  const t = shopT(lang);
  return buildRepeatLines(o.orderLines, (quote: ShopQuoteLine) => {
    let text = null;
    try {
      text = describeQuoteLine(quote, labels, t);
    } catch {
      text = null;
    }
    return text ? { slug: text.slug, image: images.get(text.slug) ?? shopLfImageBySlug(text.slug) } : null;
  });
}

/** «Fișierele mele»: stored files of the customer's orders (trashed orders included). */
export async function listAccountFiles(customerId: string): Promise<CustomerFile[]> {
  const rows = await prisma.file.findMany({
    where: {
      order: { shopCustomerId: customerId, source: "shop" },
      fileUrl: { startsWith: SHOP_ORDER_FILE_PREFIX },
      ...NOT_PURGED,
    },
    select: {
      fileUrl: true,
      fileName: true,
      sizeBytes: true,
      order: {
        select: { orderNumber: true, status: true, paymentStatus: true, isPaid: true, deletedAt: true, createdAt: true },
      },
    },
    take: 1000,
  });
  return groupCustomerFiles(rows.map((r) => ({ ...r, createdAt: r.order.createdAt })));
}

/**
 * Delete one of the customer's stored files: the R2 object goes, every File
 * row of it is marked `metaStatus='missing'`. Refused while an order in work
 * still needs it.
 */
export async function deleteAccountFile(
  customerId: string,
  key: string,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "in_use"; orders?: number[] }> {
  if (typeof key !== "string" || !key.startsWith(SHOP_ORDER_FILE_PREFIX) || key.length > 600) {
    return { ok: false, error: "not_found" };
  }
  const rows = await prisma.file.findMany({
    where: { fileUrl: key, ...NOT_PURGED },
    select: {
      id: true,
      order: { select: { shopCustomerId: true, orderNumber: true, status: true, paymentStatus: true, isPaid: true, deletedAt: true } },
    },
  });
  // Any row of another account (or none of this one): not this customer's file.
  if (rows.length === 0 || rows.some((r) => r.order.shopCustomerId !== customerId)) return { ok: false, error: "not_found" };
  const inUse = rows.filter((r) => orderNeedsFiles(r.order)).map((r) => r.order.orderNumber);
  if (inUse.length) return { ok: false, error: "in_use", orders: [...new Set(inUse)] };
  await deleteShopOrderFiles([key]);
  await prisma.file.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { metaStatus: "missing" } });
  return { ok: true };
}

/**
 * The checkout may reuse a stored `shop-orders/…` key («Repetă comanda»)
 * only for its owner, and only while the object is still there.
 */
export async function ownsReusableShopFile(customerId: string | null | undefined, key: string): Promise<boolean> {
  if (!customerId || !key.startsWith(SHOP_ORDER_FILE_PREFIX)) return false;
  const rows = await prisma.file.findMany({
    where: { fileUrl: key },
    select: { metaStatus: true, order: { select: { shopCustomerId: true } } },
    take: 50,
  });
  return rows.length > 0 && rows.every((r) => r.order.shopCustomerId === customerId) && rows.some((r) => r.metaStatus !== "missing");
}
