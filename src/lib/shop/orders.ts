import "server-only";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import type { ShopPaymentProvider } from "./constants";
import { buildShopOrderView, type ShopOrderView } from "./orderView";

/** Public storefront order by its token; null for unknown, studio or trashed orders. */
export async function loadShopOrderView(token: string): Promise<ShopOrderView | null> {
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
      trackingNumber: true,
      customerName: true,
      clientName: true,
      orderLines: { orderBy: { sortOrder: "asc" }, select: { shopLineData: true } },
    },
  });
  if (!o || o.source !== "shop" || o.deletedAt) return null;
  return buildShopOrderView(o);
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
    select: { id: true, source: true, deletedAt: true, paymentStatus: true },
  });
  if (!o || o.source !== "shop" || o.deletedAt) return "not_found";
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
