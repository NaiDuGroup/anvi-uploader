import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";

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
