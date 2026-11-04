import "server-only";
import type { Prisma } from "@prisma/client";
import { HEAVY_TX_OPTIONS, prisma } from "@/lib/prisma";
import {
  adminOrderDtfRunQuantities,
  deductStockForAdminOrderLines,
  resolveAdminOrderLineProducts,
  resolvedLineStockVariantId,
  type ResolvedAdminOrderLine,
} from "@/lib/adminOrderCreateHelpers";
import {
  groupLinesForPacking,
  resolveLargeFormatLineGroup,
} from "@/lib/largeFormat/lfCrossLinePacking";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";
import type { AdminOrderLineInput } from "@/lib/validations";

export interface ResolvedOrderLines {
  resolved: ResolvedAdminOrderLine[];
  /** Sell total of each large-format line (by line index), from the shared roll packing. */
  lfLineTotalsMdl: Map<number, number>;
}

/**
 * Resolve products, snapshots and prices of order lines. Large-format lines of
 * one material family are packed together (cheapest roll, proportional metres,
 * group minimum); every other line is resolved on its own.
 */
export async function resolveOrderLines(
  lineInputs: AdminOrderLineInput[],
  /** Passed to {@link resolveAdminOrderLineProducts} (dealer cabinet: unpriced UV / sublimation print allowed). */
  opts?: { allowUnpricedPrint?: boolean },
): Promise<ResolvedOrderLines> {
  const resolved: ResolvedAdminOrderLine[] = new Array(lineInputs.length);
  const lfLineTotalsMdl = new Map<number, number>();

  for (const [, lineIndices] of groupLinesForPacking(lineInputs)) {
    if (lineIndices.length < 1) continue;
    const groupResults = await resolveLargeFormatLineGroup(
      lineIndices.map((i) => ({ lineIndex: i, input: lineInputs[i]! })),
    );
    for (let j = 0; j < lineIndices.length; j++) {
      const lineIndex = lineIndices[j]!;
      const result = groupResults[j]!;
      resolved[lineIndex] = {
        input: lineInputs[lineIndex]!,
        largeFormatExtras: {
          largeFormatMaterialId: result.largeFormatMaterialId,
          largeFormatLineData: result.largeFormatLineData as unknown as Prisma.InputJsonValue,
        },
      };
      lfLineTotalsMdl.set(lineIndex, result.totalSellPriceMdl);
    }
  }

  const dtfRuns = adminOrderDtfRunQuantities(lineInputs);
  for (let i = 0; i < lineInputs.length; i++) {
    if (resolved[i]) continue;
    resolved[i] = await resolveAdminOrderLineProducts(lineInputs[i]!, dtfRuns[i], opts);
  }

  return { resolved, lfLineTotalsMdl };
}

const ORDER_WITH_LINES_INCLUDE = {
  files: true,
  orderLines: {
    orderBy: { sortOrder: "asc" as const },
    include: { files: true },
  },
} satisfies Prisma.OrderInclude;

export type CreatedOrderWithLines = Prisma.OrderGetPayload<{
  include: typeof ORDER_WITH_LINES_INCLUDE;
}>;

/**
 * Create the order, one order line per resolved line with its files, deduct
 * stock (flagging procurement when short; skipped with `skipStock`) and log `order_created`, in one
 * transaction. `afterCreate` runs inside the same transaction.
 */
export async function createOrderWithResolvedLines(params: {
  order: Prisma.OrderUncheckedCreateInput;
  resolved: ResolvedAdminOrderLine[];
  /**
   * User id written to stock movements and the order log. Null for an
   * anonymous storefront order: stock movements get no author and the log
   * row is written as "client" (like the public `POST /api/orders`).
   */
  actorId: string | null;
  /** Per line (by index): storefront cart-line snapshot for `OrderLine.shopLineData`. */
  shopLineData?: readonly (Prisma.InputJsonValue | undefined)[];
  /**
   * Do not deduct stock and do not flag procurement (storefront test orders
   * created while the fake `test` payment provider is active).
   */
  skipStock?: boolean;
  afterCreate?: (tx: Prisma.TransactionClient, order: CreatedOrderWithLines) => Promise<void>;
}): Promise<CreatedOrderWithLines> {
  const { resolved, actorId } = params;

  return prisma.$transaction(async (tx) => {
    const o = await tx.order.create({ data: params.order });

    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i]!;
      const li = r.input;
      await tx.orderLine.create({
        data: {
          orderId: o.id,
          sortOrder: i,
          productType: li.productType,
          mugLayoutData:
            li.productType === "mug" && li.mugLayoutData != null
              ? (li.mugLayoutData as unknown as Prisma.InputJsonValue)
              : undefined,
          mugProductSnapshot: r.mugExtras?.mugProductSnapshot ?? undefined,
          notebookLayoutData:
            li.productType === "notebook" && li.notebookLayoutData != null
              ? (li.notebookLayoutData as unknown as Prisma.InputJsonValue)
              : undefined,
          notebookProductSnapshot: r.notebookExtras?.notebookProductSnapshot ?? undefined,
          penLayoutData:
            li.productType === "pen" && li.penLayoutData != null
              ? (li.penLayoutData as unknown as Prisma.InputJsonValue)
              : undefined,
          // Mugs, pens and notebooks reference the unified variant only.
          stockVariantId: resolvedLineStockVariantId(r) ?? undefined,
          penProductSnapshot: r.penExtras?.penProductSnapshot ?? undefined,
          largeFormatMaterialId:
            li.productType === "large_format_print"
              ? r.largeFormatExtras?.largeFormatMaterialId
              : undefined,
          largeFormatLineData:
            li.productType === "large_format_print"
              ? r.largeFormatExtras?.largeFormatLineData
              : undefined,
          sheetPaperId: isSheetProductType(li.productType)
            ? r.businessCardExtras?.sheetPaperId
            : undefined,
          businessCardLineData: isSheetProductType(li.productType)
            ? r.businessCardExtras?.businessCardLineData
            : undefined,
          dtfLineData:
            li.productType === "dtf_apparel" && r.dtfExtras
              ? (r.dtfExtras.dtfLineData as unknown as Prisma.InputJsonValue)
              : undefined,
          uvLineData:
            li.productType === "uv_print" && r.uvExtras
              ? (r.uvExtras.uvLineData as unknown as Prisma.InputJsonValue)
              : undefined,
          sublimationLineData:
            li.productType === "sublimation_print" && r.sublimationExtras
              ? (r.sublimationExtras.sublimationLineData as unknown as Prisma.InputJsonValue)
              : undefined,
          designId: li.designId ?? undefined,
          shopLineData: params.shopLineData?.[i] ?? undefined,
          files: {
            create: li.files.map((file) => ({
              orderId: o.id,
              fileName: file.fileName,
              fileUrl: file.fileUrl,
              copies: file.copies,
              color: file.color,
              paperType: file.paperType,
              pageCount: file.pageCount,
            })),
          },
        },
      });
    }

    const stockRes = params.skipStock
      ? { needsProcurement: false, procurementMeta: undefined }
      : await deductStockForAdminOrderLines(tx, {
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdById: actorId,
          resolved,
        });

    let out = await tx.order.findUniqueOrThrow({
      where: { id: o.id },
      include: ORDER_WITH_LINES_INCLUDE,
    });

    if (stockRes.needsProcurement && stockRes.procurementMeta) {
      out = await tx.order.update({
        where: { id: o.id },
        data: {
          needsProcurement: true,
          procurementMeta: stockRes.procurementMeta,
        },
        include: ORDER_WITH_LINES_INCLUDE,
      });
    }

    await tx.orderLog.create({
      data: {
        orderId: out.id,
        userId: actorId ?? "client",
        action: "order_created",
      },
    });

    if (params.afterCreate) await params.afterCreate(tx, out);

    return out;
  }, HEAVY_TX_OPTIONS);
}
