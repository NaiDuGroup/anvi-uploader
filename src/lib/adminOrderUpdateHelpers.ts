import type { File as DbFile, Order, OrderLine } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import type {
  AdminOrderLineInput,
  FileInput,
  UpdateAdminOrderInput,
} from "@/lib/validations";
import type { MugLayoutData, NotebookLayoutData, PenLayoutData } from "@/lib/validations";
import { returnMugStockForOrder } from "@/lib/mug/mugOrderStock";
import { returnMaterialStockForOrder } from "@/lib/stock/unified/materialOrderStock";
import { returnNotebookStockForOrder } from "@/lib/notebook/notebookOrderStock";
import { returnPenStockForOrder } from "@/lib/pen/penOrderStock";
import {
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  deductStockForAdminOrderLines,
  resolveAdminOrderLineProducts,
  resolvedLineStockVariantId,
  type ResolvedAdminOrderLine,
} from "@/lib/adminOrderCreateHelpers";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import {
  groupLinesForPacking,
  resolveLargeFormatLineGroup,
} from "@/lib/largeFormat/lfCrossLinePacking";
import {
  businessCardTrimSize,
  parseBusinessCardLineData,
} from "@/lib/businessCard/parseBusinessCardLineData";
import { returnPrinterConsumablesForOrder } from "@/lib/stock/unified/printers";
import { toOrderPriceDecimal } from "@/lib/orderPriceDecimal";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";
import { returnDtfStockForOrder } from "@/lib/dtf/dtfOrderStock";
import { dtfInputFromLineData } from "@/lib/dtf/dtfInputFromLineData";
import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import { returnUvStockForOrder } from "@/lib/uv/uvOrderStock";
import { uvInputFromLineData } from "@/lib/uv/uvInputFromLineData";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import { returnSublimationStockForOrder } from "@/lib/sublimation/sublimationOrderStock";
import { sublimationInputFromLineData } from "@/lib/sublimation/sublimationInputFromLineData";
import { parseSublimationLineData } from "@/lib/sublimation/parseSublimationLineData";

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

  const lineInputs: AdminOrderLineInput[] = [];

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

    const prevBc =
      isSheetProductType(pl.productType)
        ? parseBusinessCardLineData(dbLine?.businessCardLineData)
        : null;
    /** Pre-preset rows only stored the footprint, so derive the finished size. */
    const prevBcTrim = prevBc ? businessCardTrimSize(prevBc) : null;

    const lineInput: AdminOrderLineInput = {
      productType: pl.productType,
      mugLayoutData,
      mugProductId: pl.mugProductId,
      mugOther: pl.mugOther,
      notebookLayoutData,
      notebookProductId: pl.notebookProductId,
      notebookOther: pl.notebookOther,
      // Pen fields were not passed through before, so editing an order with a pen line failed.
      penLayoutData:
        pl.productType === "pen"
          ? (pl.penLayoutData ?? parseJsonLayout<PenLayoutData>(dbLine?.penLayoutData))
          : undefined,
      penProductId: pl.penProductId,
      penOther: pl.penOther,
      largeFormatMaterialId:
        pl.largeFormatMaterialId ?? dbLine?.largeFormatMaterialId ?? undefined,
      printWidthCm: pl.printWidthCm ?? prevLf?.printWidthCm,
      printHeightCm: pl.printHeightCm ?? prevLf?.printHeightCm,
      quantity: pl.quantity ?? prevLf?.quantity ?? prevBc?.quantity,
      customerType:
        pl.customerType ?? prevLf?.customerType ?? prevBc?.customerType,
      sheetPaperId:
        pl.sheetPaperId ?? dbLine?.sheetPaperId ?? prevBc?.paperSnapshot.id,
      cardSides: pl.cardSides ?? prevBc?.sides,
      /**
       * A pre-preset row must fall back to `"custom"` plus its stored trim
       * size: leaving this undefined would let the resolver apply the default
       * preset and silently resize the cards on an unrelated edit.
       */
      cardPresetId:
        pl.cardPresetId ?? (prevBc ? (prevBc.presetId ?? "custom") : undefined),
      cardTrimWidthCm: pl.cardTrimWidthCm ?? prevBcTrim?.widthCm,
      cardTrimHeightCm: pl.cardTrimHeightCm ?? prevBcTrim?.heightCm,
      /** Honour explicit `null` (custom size) over previous preset; `undefined` keeps previous. */
      lfSizePresetId:
        pl.lfSizePresetId !== undefined
          ? pl.lfSizePresetId
          : (prevLf?.sizePresetSnapshot?.presetId ?? null),
      dtf:
        pl.productType === "dtf_apparel"
          ? (pl.dtf ?? dtfInputFromLineData(parseDtfLineData(dbLine?.dtfLineData)))
          : undefined,
      uv:
        pl.productType === "uv_print"
          ? (pl.uv ?? uvInputFromLineData(parseUvLineData(dbLine?.uvLineData)))
          : undefined,
      sublimation:
        pl.productType === "sublimation_print"
          ? (pl.sublimation ??
            sublimationInputFromLineData(parseSublimationLineData(dbLine?.sublimationLineData)))
          : undefined,
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

    if (isSheetProductType(lineInput.productType)) {
      const hasSize =
        lineInput.cardPresetId != null && lineInput.cardPresetId !== "custom"
          ? true
          : lineInput.cardTrimWidthCm != null &&
            lineInput.cardTrimHeightCm != null;
      if (
        lineInput.sheetPaperId == null ||
        lineInput.quantity == null ||
        !hasSize
      ) {
        throw new AdminOrderUpdateError("Incomplete business card line");
      }
    }

    lineInputs.push(lineInput);
  }

  // Same-material large-format lines share one layout and one retail minimum,
  // exactly as on order create — otherwise an edit would re-price them one by
  // one and the total would jump.
  const resolved: ResolvedAdminOrderLine[] = new Array(lineInputs.length);
  for (const [, lineIndices] of groupLinesForPacking(lineInputs)) {
    const groupResults = await resolveLargeFormatLineGroup(
      lineIndices.map((i) => ({ lineIndex: i, input: lineInputs[i]! })),
    );
    lineIndices.forEach((lineIndex, j) => {
      const result = groupResults[j]!;
      resolved[lineIndex] = {
        input: lineInputs[lineIndex]!,
        largeFormatExtras: {
          largeFormatMaterialId: result.largeFormatMaterialId,
          largeFormatLineData:
            result.largeFormatLineData as unknown as Prisma.InputJsonValue,
        },
      };
    });
  }
  for (let i = 0; i < lineInputs.length; i++) {
    if (resolved[i]) continue;
    resolved[i] = await resolveAdminOrderLineProducts(lineInputs[i]!);
  }

  return resolved;
}

export class AdminOrderUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderUpdateError";
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
    mugProductSnapshot:
      (r.mugExtras?.mugProductSnapshot as Prisma.InputJsonValue | undefined) ??
      PrismaNs.JsonNull,
    notebookLayoutData:
      li.productType === "notebook" && li.notebookLayoutData != null
        ? (li.notebookLayoutData as unknown as Prisma.InputJsonValue)
        : PrismaNs.JsonNull,
    notebookProductSnapshot:
      (r.notebookExtras?.notebookProductSnapshot as
        | Prisma.InputJsonValue
        | undefined) ?? PrismaNs.JsonNull,
    penLayoutData:
      li.productType === "pen" && li.penLayoutData != null
        ? (li.penLayoutData as unknown as Prisma.InputJsonValue)
        : PrismaNs.JsonNull,
    // Mug / pen / notebook lines reference their unified variant.
    stockVariantId: resolvedLineStockVariantId(r),
    penProductSnapshot:
      (r.penExtras?.penProductSnapshot as Prisma.InputJsonValue | undefined) ??
      PrismaNs.JsonNull,
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
    sheetPaperId:
      isSheetProductType(li.productType)
        ? (r.businessCardExtras?.sheetPaperId ?? null)
        : null,
    businessCardLineData:
      isSheetProductType(li.productType)
        ? ((r.businessCardExtras?.businessCardLineData ?? PrismaNs.JsonNull) as
            | Prisma.InputJsonValue
            | typeof PrismaNs.JsonNull)
        : PrismaNs.JsonNull,
    dtfLineData:
      li.productType === "dtf_apparel" && r.dtfExtras
        ? (r.dtfExtras.dtfLineData as unknown as Prisma.InputJsonValue)
        : PrismaNs.JsonNull,
    uvLineData:
      li.productType === "uv_print" && r.uvExtras
        ? (r.uvExtras.uvLineData as unknown as Prisma.InputJsonValue)
        : PrismaNs.JsonNull,
    sublimationLineData:
      li.productType === "sublimation_print" && r.sublimationExtras
        ? (r.sublimationExtras.sublimationLineData as unknown as Prisma.InputJsonValue)
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

  // Rolls, paper, mugs / pens / notebooks: whatever the order still holds by the unified ledger
  // (independent of needsProcurement; rolls on the roll they sit on after layout transfers).
  await returnMaterialStockForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });
  await returnMugStockForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });
  await returnPenStockForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });
  await returnNotebookStockForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });
  await returnDtfStockForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });
  await returnUvStockForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });
  await returnSublimationStockForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });
  // Ink / toner / DTF consumables: whatever the order still holds, by ledger (old orders: ink archive).
  await returnPrinterConsumablesForOrder(tx, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: userId,
  });

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
      price: toOrderPriceDecimal(scalarPatch.price),
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
