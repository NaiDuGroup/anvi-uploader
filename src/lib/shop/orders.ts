import "server-only";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { shopT, type ShopLang } from "@/lib/storefront/i18n";
import { describeQuoteLine, type ShopLineLabels } from "@/lib/storefront/lineLabels";
import { isShopPrintQuote } from "@/lib/storefront/printPrices";
import { isShopUvLine } from "@/lib/storefront/stock";
import { isPsQuoteLine } from "@/lib/storefront/printShop/pricing";
import { isShopUvStickersLine } from "@/lib/storefront/printShop/uvStickers";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import type { ShopPaymentProvider } from "./constants";
import { buildShopOrderView, type ShopLineDescriber, type ShopOrderView } from "./orderView";

function isStoredQuoteLine(q: unknown): q is ShopQuoteLine {
  if (q == null || typeof q !== "object") return false;
  const v = q as Record<string, unknown>;
  if (v.kind === "mug" || v.kind === "notebook" || v.kind === "pen") return typeof v.productId === "string";
  if (v.kind === "uv") return isShopUvLine(v) || isShopUvStickersLine(v);
  if (v.kind === "sheetShop") return isPsQuoteLine(v);
  if (v.kind === "businessCard") return v.pricing === "shopPack" && (v.sides === "one" || v.sides === "two");
  if (v.kind === "print") return isShopPrintQuote(v);
  return v.kind === "dtf" && typeof v.garmentId === "string" && Array.isArray(v.sizes) && Array.isArray(v.zones);
}

/** Line names in `lang` from the catalog labels (the stored text stays the fallback). */
export function shopLineDescriber(labels: ShopLineLabels, lang: ShopLang): ShopLineDescriber {
  const t = shopT(lang);
  return (quote) => (isStoredQuoteLine(quote) ? describeQuoteLine(quote, labels, t) : null);
}

/**
 * Public storefront order by its token; null for unknown, studio or trashed
 * orders. With `describe` the line names are given in the viewer's language.
 */
export async function loadShopOrderView(token: string, describe?: ShopLineDescriber): Promise<ShopOrderView | null> {
  if (!token || token.length > 64) return null;
  const o = await prisma.order.findUnique({
    where: { publicToken: token },
    select: {
      source: true,
      deletedAt: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      isPaid: true,
      shippedAt: true,
      price: true,
      deliveryPriceMdl: true,
      deliveryMethod: true,
      deliveryCity: true,
      deliveryAddress: true,
      deliveryNote: true,
      trackingNumber: true,
      customerName: true,
      clientName: true,
      orderLines: { orderBy: { sortOrder: "asc" }, select: { shopLineData: true, files: { select: { paperType: true } } } },
    },
  });
  if (!o || o.source !== "shop" || o.deletedAt) return null;
  return buildShopOrderView(o, describe);
}

/**
 * Mark a storefront order paid (provider callback / test provider).
 * Idempotent: an order already paid answers ok without a second write.
 * Returns "not_found" for unknown, studio or trashed orders.
 */
export async function markShopOrderPaid(
  token: string,
  provider: ShopPaymentProvider,
  paymentRef?: string,
): Promise<"paid" | "already_paid" | "not_found"> {
  if (!token || token.length > 64) return "not_found";
  const o = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, source: true, deletedAt: true, paymentStatus: true, paymentProvider: true },
  });
  if (!o || o.source !== "shop" || o.deletedAt) return "not_found";
  // The fake provider only settles orders created as test orders.
  if (provider === "test" && o.paymentProvider !== "test") return "not_found";
  if (o.paymentStatus === "paid") return "already_paid";

  const ref = paymentRef ?? `${provider}-${nanoid(12)}`;
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: o.id, paymentStatus: { not: "paid" } },
      data: {
        paymentStatus: "paid",
        isPaid: true,
        paidAt: new Date(),
        paymentProvider: provider,
        paymentRef: ref,
      },
    });
    if (res.count === 1) {
      await tx.orderLog.create({
        data: {
          orderId: o.id,
          userId: "client",
          action: "field_updated",
          field: "isPaid",
          oldValue: "false",
          newValue: "true",
          metadata: { paymentProvider: provider, paymentRef: ref },
        },
      });
    }
    return res.count;
  });
  return updated === 1 ? "paid" : "already_paid";
}
