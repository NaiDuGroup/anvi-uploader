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
      kind: "lf_roll";
      materialId: string;
      requestedLinearMeters: number;
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

/** Normalize DB JSON to a list (legacy single-object or array). */
export function procurementMetaToList(meta: unknown): OrderProcurementMetaItem[] {
  if (meta == null) {
    return [];
  }
  if (Array.isArray(meta)) {
    return meta.filter(
      (m): m is OrderProcurementMetaItem =>
        m !== null &&
        typeof m === "object" &&
        "kind" in m &&
        ((m as { kind: unknown }).kind === "mug" ||
          (m as { kind: unknown }).kind === "notebook" ||
          (m as { kind: unknown }).kind === "lf_roll" ||
          (m as { kind: unknown }).kind === "ink"),
    );
  }
  if (typeof meta === "object" && meta !== null && "kind" in meta) {
    const k = (meta as { kind: unknown }).kind;
    if (k === "mug" || k === "notebook" || k === "lf_roll" || k === "ink") {
      return [meta as OrderProcurementMetaItem];
    }
  }
  return [];
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
