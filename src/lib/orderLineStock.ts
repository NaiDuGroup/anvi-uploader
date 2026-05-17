import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";

type FilesLike = { copies: number }[];

export type OrderLineWithFiles = {
  productType: string;
  mugProductId: string | null;
  notebookProductId: string | null;
  files: FilesLike;
};

/**
 * Total mug pieces for a catalog SKU across order lines (or legacy single line).
 */
export function mugOrderStockQtyForProduct(
  order: {
    productType: string;
    mugProductId: string | null;
    files: FilesLike;
    orderLines?: OrderLineWithFiles[] | null;
  },
  mugProductId: string,
): number {
  const lines = order.orderLines?.length ? order.orderLines : null;
  if (lines) {
    return lines
      .filter((l) => l.productType === "mug" && l.mugProductId === mugProductId)
      .reduce(
        (acc, l) => acc + mugOrderStockQuantityFromFiles(l.files),
        0,
      );
  }
  if (order.productType === "mug" && order.mugProductId === mugProductId) {
    return mugOrderStockQuantityFromFiles(order.files);
  }
  return 0;
}

export function notebookOrderStockQtyForProduct(
  order: {
    productType: string;
    notebookProductId: string | null;
    files: FilesLike;
    orderLines?: OrderLineWithFiles[] | null;
  },
  notebookProductId: string,
): number {
  const lines = order.orderLines?.length ? order.orderLines : null;
  if (lines) {
    return lines
      .filter(
        (l) =>
          l.productType === "notebook" && l.notebookProductId === notebookProductId,
      )
      .reduce(
        (acc, l) => acc + notebookOrderStockQuantityFromFiles(l.files),
        0,
      );
  }
  if (
    order.productType === "notebook" &&
    order.notebookProductId === notebookProductId
  ) {
    return notebookOrderStockQuantityFromFiles(order.files);
  }
  return 0;
}

export type OrderLineLfLike = {
  productType: string;
  largeFormatMaterialId: string | null;
  largeFormatLineData: unknown;
};

/** Linear meters of roll material for one catalog SKU (from persisted line JSON). */
export function lfRollLinearMetersForMaterial(
  order: { orderLines?: OrderLineLfLike[] | null },
  materialId: string,
): number {
  const lines = order.orderLines;
  if (!lines?.length) return 0;
  let sum = 0;
  for (const l of lines) {
    if (l.productType !== "large_format_print" || l.largeFormatMaterialId !== materialId) {
      continue;
    }
    const d = parseLargeFormatLineData(l.largeFormatLineData);
    if (d && typeof d.calculatedLinearMeters === "number") {
      sum += d.calculatedLinearMeters;
    }
  }
  return sum;
}

/** Total ink ml across all large-format lines on the order. */
export function largeFormatTotalInkMl(order: { orderLines?: OrderLineLfLike[] | null }): number {
  const lines = order.orderLines;
  if (!lines?.length) return 0;
  let sum = 0;
  for (const l of lines) {
    if (l.productType !== "large_format_print") continue;
    const d = parseLargeFormatLineData(l.largeFormatLineData);
    if (d && typeof d.inkMlUsed === "number") {
      sum += d.inkMlUsed;
    }
  }
  return sum;
}
