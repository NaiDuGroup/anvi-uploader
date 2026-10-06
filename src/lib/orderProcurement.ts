import type { Prisma } from "@prisma/client";
import type { PrintProcess } from "@/lib/printProcess";
import { parsePrintProcess } from "@/lib/printProcess";

/** Stored on `Order.procurementMeta` when stock could not be reserved at creation or restore. */
export type OrderProcurementMetaItem =
  | {
      kind: "mug";
      productId: string;
      sku?: string;
      requestedQty: number;
      stockAtOrder: number;
    }
  | {
      kind: "notebook";
      productId: string;
      sku?: string;
      requestedQty: number;
      stockAtOrder: number;
    }
  | {
      kind: "pen";
      productId: string;
      sku?: string;
      requestedQty: number;
      stockAtOrder: number;
    }
  | {
      kind: "lf_roll";
      materialId: string;
      requestedLinearMeters: number;
      stockAtOrder: number;
    }
  | {
      kind: "sheet_paper";
      sheetPaperId: string;
      requestedSheets: number;
      stockAtOrder: number;
    }
  | {
      kind: "ink";
      /** Inventory tank id (`PrintProcess` code); omitted in legacy rows → `large_format_roll`. */
      printProcess?: string;
      requestedMl: number;
      stockAtOrder: number;
    };

/** @deprecated Alias for `OrderProcurementMetaItem` */
export type OrderProcurementMeta = OrderProcurementMetaItem;

export type OrderProcurementMetaStored =
  | OrderProcurementMetaItem
  | OrderProcurementMetaItem[];

export function procurementMetaToJson(
  meta: OrderProcurementMetaStored,
): Prisma.InputJsonValue {
  return meta as unknown as Prisma.InputJsonValue;
}

const PROCUREMENT_KINDS: readonly OrderProcurementMetaItem["kind"][] = [
  "mug",
  "notebook",
  "pen",
  "lf_roll",
  "sheet_paper",
  "ink",
];

function isProcurementMetaItem(value: unknown): value is OrderProcurementMetaItem {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    return false;
  }
  const kind = (value as { kind: unknown }).kind;
  return (
    typeof kind === "string" &&
    (PROCUREMENT_KINDS as readonly string[]).includes(kind)
  );
}

/** Normalize DB JSON to a list (legacy single-object or array). */
export function procurementMetaToList(meta: unknown): OrderProcurementMetaItem[] {
  if (meta == null) {
    return [];
  }
  if (Array.isArray(meta)) {
    return meta.filter(isProcurementMetaItem);
  }
  return isProcurementMetaItem(meta) ? [meta] : [];
}

/** Resolved tank for an ink procurement row (legacy → wide-format roll). */
export function inkProcurementPrintProcess(
  m: Extract<OrderProcurementMetaItem, { kind: "ink" }>,
): PrintProcess {
  return parsePrintProcess(m.printProcess);
}

export function skuFromMugSnapshot(s: unknown): string | undefined {
  if (s && typeof s === "object" && "sku" in s) {
    const v = (s as { sku?: unknown }).sku;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

export function skuFromNotebookSnapshot(s: unknown): string | undefined {
  if (s && typeof s === "object" && "sku" in s) {
    const v = (s as { sku?: unknown }).sku;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

export function skuFromPenSnapshot(s: unknown): string | undefined {
  if (s && typeof s === "object" && "sku" in s) {
    const v = (s as { sku?: unknown }).sku;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}
