import type { File as DbFile, Order, OrderLine } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import type {
  AdminOrderLineInput,
  FileInput,
  UpdateAdminOrderInput,
} from "@/lib/validations";
import type { MugLayoutData, NotebookLayoutData } from "@/lib/validations";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { recordMugStockReturnOnOrderDelete } from "@/lib/mug/mugStockLedger";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { recordNotebookStockReturnOnOrderDelete } from "@/lib/notebook/notebookStockLedger";
import {
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  deductStockForAdminOrderLines,
  resolveAdminOrderLineProducts,
  type ResolvedAdminOrderLine,
} from "@/lib/adminOrderCreateHelpers";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { INK_STOCK_KIND } from "@/lib/ink/inkStockKinds";
import { restoreInkMl, restoreLfRollStock } from "@/lib/largeFormat/lfRollStockLedger";
import { LF_ROLL_STOCK_KIND } from "@/lib/largeFormat/lfRollStockKinds";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";

export type OrderWithLinesAndFiles = Order & {
  orderLines: (OrderLine & { files: DbFile[] })[];
  files: DbFile[];
};

function collectFilesById(order: OrderWithLinesAndFiles): Map<string, DbFile> {
  const m = new Map<string, DbFile>();
  for (const line of order.orderLines) {
    for (const f of line.files) {
      m.set(f.id, f);
    }
  }
  for (const f of order.files) {
    m.set(f.id, f);
  }
  return m;
}

export function mergeExistingOrderFile(
  dbFile: DbFile,
  patch: {
    fileId: string;
    copies?: number;
    color?: "bw" | "color";
    paperType?: string;
    pageCount?: number | null;
  },
): FileInput {
  return {
    fileName: dbFile.fileName,
    fileUrl: dbFile.fileUrl,
    copies: patch.copies ?? dbFile.copies,
    color: patch.color ?? (dbFile.color === "color" ? "color" : "bw"),
    paperType:
      patch.paperType ??
      (dbFile.paperType != null ? dbFile.paperType : undefined),
    pageCount:
      patch.pageCount !== undefined
        ? patch.pageCount ?? undefined
        : dbFile.pageCount ?? undefined,
  };
}

function parseJsonLayout<T>(raw: unknown): T | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  return raw as T;
}

/** Build resolver input from PATCH payload + DB row fallback for layouts. */
export async function resolveLinesForAdminOrderUpdate(
  order: OrderWithLinesAndFiles,
  validated: UpdateAdminOrderInput,
): Promise<ResolvedAdminOrderLine[]> {
  const filesById = collectFilesById(order);
  const lineById = new Map(order.orderLines.map((l) => [l.id, l]));

  const resolved: ResolvedAdminOrderLine[] = [];

  for (const pl of validated.lines) {
    const dbLine = pl.orderLineId ? lineById.get(pl.orderLineId) ?? null : null;

    const mergedFiles: FileInput[] = [];
    for (const spec of pl.files) {
      if ("fileId" in spec) {
        const dbf = filesById.get(spec.fileId);
        if (!dbf || dbf.orderId !== order.id) {
          throw new AdminOrderUpdateError(`Unknown file: ${spec.fileId}`);
        }
        mergedFiles.push(mergeExistingOrderFile(dbf, spec));
      } else {
        mergedFiles.push(spec);
      }
    }

    let mugLayoutData: MugLayoutData | undefined;
    let notebookLayoutData: NotebookLayoutData | undefined;

    if (pl.productType === "mug") {
      mugLayoutData =
        pl.mugLayoutData ??
        parseJsonLayout<MugLayoutData>(dbLine?.mugLayoutData) ??
        ({
          templateId: "text_photo",
          text: "",
          fontFamily: "Roboto",
          textColor: "#000000",
          backgroundColor: "transparent",
          photoUrls: [],
          photoSettings: [],
        } satisfies MugLayoutData);
    }

    if (pl.productType === "notebook") {
      notebookLayoutData =
        pl.notebookLayoutData ??
        parseJsonLayout<NotebookLayoutData>(dbLine?.notebookLayoutData) ??
        ({
          templateId: "text_photo",
          text: "",
          fontFamily: "Roboto",
          textColor: "#000000",
          backgroundColor: "transparent",
          photoUrls: [],
          photoSettings: [],
        } satisfies NotebookLayoutData);
    }

    const prevLf =
      pl.productType === "large_format_print"
        ? parseLargeFormatLineData(dbLine?.largeFormatLineData)
        : null;

    const lineInput: AdminOrderLineInput = {
      productType: pl.productType,
      mugLayoutData,
      mugProductId: pl.mugProductId,
      mugOther: pl.mugOther,
      notebookLayoutData,
      notebookProductId: pl.notebookProductId,
      notebookOther: pl.notebookOther,
      largeFormatMaterialId:
        pl.largeFormatMaterialId ?? dbLine?.largeFormatMaterialId ?? undefined,
      printWidthCm: pl.printWidthCm ?? prevLf?.printWidthCm,
      printHeightCm: pl.printHeightCm ?? prevLf?.printHeightCm,
      quantity: pl.quantity ?? prevLf?.quantity,
      customerType: pl.customerType ?? prevLf?.customerType,
      files: mergedFiles,
    };

    if (lineInput.productType === "large_format_print") {
      if (
        lineInput.largeFormatMaterialId == null ||
        lineInput.printWidthCm == null ||
        !Number.isFinite(lineInput.printWidthCm) ||
        lineInput.printHeightCm == null ||
        !Number.isFinite(lineInput.printHeightCm) ||
        lineInput.quantity == null ||
        lineInput.customerType == null
      ) {
        throw new AdminOrderUpdateError("Incomplete large format line");
      }
    }

    resolved.push(await resolveAdminOrderLineProducts(lineInput));
  }

  return resolved;
}

export class AdminOrderUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderUpdateError";
  }
}

async function returnSkuStockBeforeStructureEdit(
  tx: Prisma.TransactionClient,
  order: OrderWithLinesAndFiles,
  userId: string,
): Promise<void> {
  if (order.needsProcurement) return;

  for (const line of order.orderLines) {
    if (line.productType === "mug" && line.mugProductId) {
      const qty = mugOrderStockQuantityFromFiles(line.files);
      if (qty > 0) {
        await recordMugStockReturnOnOrderDelete(tx, {
          mugProductId: line.mugProductId,
          quantity: qty,
          orderId: order.id,
          orderNumber: order.orderNumber,
          createdById: userId,
        });
      }
    } else if (line.productType === "notebook" && line.notebookProductId) {
      const qty = notebookOrderStockQuantityFromFiles(line.files);
      if (qty > 0) {
        await recordNotebookStockReturnOnOrderDelete(tx, {
          notebookProductId: line.notebookProductId,
          quantity: qty,
          orderId: order.id,
          orderNumber: order.orderNumber,
          createdById: userId,
        });
      }
    } else if (
      line.productType === "large_format_print" &&
      line.largeFormatMaterialId
    ) {
      const lf = parseLargeFormatLineData(line.largeFormatLineData);
      if (lf) {
        const lm = lf.calculatedLinearMeters;
        const inkMl = lf.inkMlUsed ?? 0;
        if (lm > 0) {
          await restoreLfRollStock(tx, line.largeFormatMaterialId, lm, {
            kind: LF_ROLL_STOCK_KIND.ORDER_RETURN,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            materialCostMdl: Number.isFinite(lf.materialCost)
              ? Math.round(lf.materialCost)
              : null,
            materialSellPriceMdl: Number.isFinite(lf.materialSellPrice)
              ? Math.round(lf.materialSellPrice)
              : null,
            createdById: userId,
          });
        }
        if (inkMl > 0) {
          await restoreInkMl(tx, inkMl, DEFAULT_PRINT_PROCESS, {
            kind: INK_STOCK_KIND.ORDER_RETURN,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderLineId: line.id,
            inkCostMdl:
              lf.inkCostMdl != null && Number.isFinite(lf.inkCostMdl)
                ? Math.round(lf.inkCostMdl)
                : null,
            inkSellPriceMdl:
              lf.inkSellPriceMdl != null && Number.isFinite(lf.inkSellPriceMdl)
                ? Math.round(lf.inkSellPriceMdl)
                : null,
            createdById: userId,
          });
        }
      }
    }
  }
}

function orderLinePersistFields(
  r: ResolvedAdminOrderLine,
  sortOrder: number,
): Prisma.OrderLineUncheckedCreateWithoutOrderInput {
  const li = r.input;
  return {
    sortOrder,
    productType: li.productType,
    mugLayoutData:
      li.productType === "mug" && li.mugLayoutData != null
        ? (li.mugLayoutData as unknown as Prisma.InputJsonValue)
        : PrismaNs.JsonNull,
    mugProductId: r.mugExtras?.mugProductId ?? null,
    mugProductSnapshot:
      (r.mugExtras?.mugProductSnapshot as Prisma.InputJsonValue | undefined) ??
      PrismaNs.JsonNull,
    notebookLayoutData:
      li.productType === "notebook" && li.notebookLayoutData != null
        ? (li.notebookLayoutData as unknown as Prisma.InputJsonValue)
        : PrismaNs.JsonNull,
    notebookProductId: r.notebookExtras?.notebookProductId ?? null,
    notebookProductSnapshot:
      (r.notebookExtras?.notebookProductSnapshot as
        | Prisma.InputJsonValue
        | undefined) ?? PrismaNs.JsonNull,
    largeFormatMaterialId:
      li.productType === "large_format_print"
        ? (r.largeFormatExtras?.largeFormatMaterialId ?? null)
        : null,
    largeFormatLineData:
      li.productType === "large_format_print"
        ? ((r.largeFormatExtras?.largeFormatLineData ?? PrismaNs.JsonNull) as
            | Prisma.InputJsonValue
            | typeof PrismaNs.JsonNull)
        : PrismaNs.JsonNull,
  };
}

export type AdminOrderScalarPatch = {
  phone: string;
  clientName: string | null;
  clientId: string | null;
  notes: string | null;
  price: number | null;
};

/**
 * Applies validated multi-line snapshot inside an existing transaction.
 */
export async function syncAdminOrderStructureInTx(
  tx: Prisma.TransactionClient,
  order: OrderWithLinesAndFiles,
  validated: UpdateAdminOrderInput,
  resolved: ResolvedAdminOrderLine[],
  userId: string,
  scalarPatch: AdminOrderScalarPatch,
): Promise<void> {
  const filesById = collectFilesById(order);
  const oldLineIds = new Set(order.orderLines.map((l) => l.id));

  await returnSkuStockBeforeStructureEdit(tx, order, userId);

  const targetLineIds: (string | null)[] = validated.lines.map((pl) => {
    if (pl.orderLineId && oldLineIds.has(pl.orderLineId)) {
      return pl.orderLineId;
    }
    return null;
  });

  for (let i = 0; i < targetLineIds.length; i++) {
    if (targetLineIds[i] !== null) continue;
    const fields = orderLinePersistFields(resolved[i]!, i);
    const nl = await tx.orderLine.create({
      data: {
        ...fields,
        orderId: order.id,
      },
    });
    targetLineIds[i] = nl.id;
  }

  const keepIds = new Set(targetLineIds.filter((id): id is string => id != null));

  for (let i = 0; i < targetLineIds.length; i++) {
    const id = targetLineIds[i]!;
    await tx.orderLine.update({
      where: { id },
      data: orderLinePersistFields(resolved[i]!, i),
    });
  }

  const desiredFileIds = new Set<string>();

  for (let li = 0; li < validated.lines.length; li++) {
    const prismaLineId = targetLineIds[li]!;
    for (const spec of validated.lines[li].files) {
      if ("fileId" in spec) {
        const dbf = filesById.get(spec.fileId);
        if (!dbf || dbf.orderId !== order.id) {
          throw new AdminOrderUpdateError(`Unknown file: ${spec.fileId}`);
        }
        desiredFileIds.add(spec.fileId);
        const merged = mergeExistingOrderFile(dbf, spec);
        await tx.file.update({
          where: { id: spec.fileId },
          data: {
            orderLineId: prismaLineId,
            copies: merged.copies,
            color: merged.color,
            paperType: merged.paperType ?? null,
            pageCount: merged.pageCount ?? null,
            fileName: merged.fileName,
            fileUrl: merged.fileUrl,
          },
        });
      } else {
        const nf = await tx.file.create({
          data: {
            orderId: order.id,
            orderLineId: prismaLineId,
            fileName: spec.fileName,
            fileUrl: spec.fileUrl,
            copies: spec.copies,
            color: spec.color,
            paperType: spec.paperType ?? null,
            pageCount: spec.pageCount ?? null,
          },
        });
        desiredFileIds.add(nf.id);
      }
    }
  }

  await tx.file.deleteMany({
    where: {
      orderId: order.id,
      id: { notIn: [...desiredFileIds] },
    },
  });

  await tx.orderLine.deleteMany({
    where: {
      orderId: order.id,
      id: { notIn: [...keepIds] },
    },
  });

  const stockRes = await deductStockForAdminOrderLines(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
    resolved,
  });

  const orderProductType = computeOrderProductTypeForAdmin(resolved);
  const denorm = buildOrderDenormalizedScalars(orderProductType, resolved);

  await tx.order.update({
    where: { id: order.id },
    data: {
      ...denorm,
      phone: scalarPatch.phone,
      clientName: scalarPatch.clientName,
      clientId: scalarPatch.clientId,
      notes: scalarPatch.notes,
      price: scalarPatch.price,
      needsProcurement: stockRes.needsProcurement,
      procurementMeta:
        stockRes.needsProcurement && stockRes.procurementMeta != null
          ? stockRes.procurementMeta
          : PrismaNs.JsonNull,
    },
  });

  await tx.orderLog.create({
    data: {
      orderId: order.id,
      userId,
      action: "field_updated",
      field: "order_structure",
      oldValue: "",
      newValue: "updated",
    },
  });
}
