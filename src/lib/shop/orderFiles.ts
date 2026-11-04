import "server-only";
import { z } from "zod";
import { dtfZoneFilePaperType } from "@/lib/dtf/dtfConstants";
import { prisma } from "@/lib/prisma";
import { isOrderUploadKey } from "./checkoutSchema";
import { SHOP_CHECKOUT_MAX_FILES_PER_LINE } from "./constants";
import { shopCustomerStatus } from "./customerStatus";
import { missingDtfFileZones } from "./orderView";
import { copyUploadToShopOrders } from "./shopFiles";

/**
 * «Încarcă fișierul acum» on the order page: the holder of the order's secret
 * link adds the artwork of a DTF line zone that has none yet (a site order
 * may be placed without a file). The upload (`POST /api/upload-url`, scope
 * «order») is copied to `shop-orders/` like at checkout and saved on that
 * line tagged with its zone, as the checkout would have saved it.
 */
export const shopOrderFileBodySchema = z
  .object({
    /** Index of the line on the order page (`sortOrder` order). */
    line: z.number().int().min(0).max(100),
    zone: z.string().trim().min(1).max(40),
    fileKey: z.string().trim().min(1).max(500).refine(isOrderUploadKey, { message: "invalid_file_key" }),
    fileName: z.string().trim().min(1).max(255),
  })
  .strict();

export type ShopOrderFileResult =
  | { status: 201; body: { ok: true } }
  | { status: 400 | 404 | 409; body: { error: string } };

export async function addShopOrderLineFile(token: string, raw: unknown): Promise<ShopOrderFileResult> {
  const parsed = shopOrderFileBodySchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "invalid_input" } };
  const { line, zone, fileKey, fileName } = parsed.data;
  if (!token || token.length > 64) return { status: 404, body: { error: "not_found" } };
  const o = await prisma.order.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      source: true,
      deletedAt: true,
      status: true,
      paymentStatus: true,
      isPaid: true,
      shippedAt: true,
      orderLines: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, productType: true, shopLineData: true, files: { select: { paperType: true } } },
      },
    },
  });
  if (!o || o.source !== "shop" || o.deletedAt) return { status: 404, body: { error: "not_found" } };
  const st = shopCustomerStatus(o);
  if (st === "shipped" || st === "delivered") return { status: 409, body: { error: "order_closed" } };
  const target = o.orderLines[line];
  if (!target || target.productType !== "dtf_apparel") return { status: 400, body: { error: "line_not_dtf" } };
  if (!missingDtfFileZones(target.shopLineData, target.files).includes(zone)) {
    return { status: 409, body: { error: "zone_has_file" } };
  }
  if (target.files.length >= SHOP_CHECKOUT_MAX_FILES_PER_LINE) return { status: 409, body: { error: "too_many_files" } };
  const key = await copyUploadToShopOrders(fileKey);
  if (!key) return { status: 400, body: { error: "file_not_found" } };
  await prisma.$transaction([
    prisma.file.create({
      data: {
        orderId: o.id,
        orderLineId: target.id,
        fileUrl: key,
        fileName,
        copies: 1,
        color: "color",
        paperType: dtfZoneFilePaperType(zone),
      },
    }),
    prisma.orderLog.create({
      data: { orderId: o.id, userId: "client", action: "file_added", metadata: { fileName, zone, source: "shop_order_page" } },
    }),
  ]);
  return { status: 201, body: { ok: true } };
}
