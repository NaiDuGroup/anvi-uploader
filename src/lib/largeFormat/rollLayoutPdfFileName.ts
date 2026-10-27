import { orderNumbersFileNamePart } from "@/lib/workshopBoard/orderNumbersFileNamePart";

/**
 * `layout-<order1>_<order2>_…-<material>-<YYYY-MM-DD>.pdf`. Order numbers come
 * first so they stay visible even when the material name is long. Used by the
 * browser build and by the server (gallery-wrap) build so both name the file
 * the same way.
 */
export function buildRollLayoutPdfFileName(
  materialLabel: string,
  orderNumbers: readonly (number | null | undefined)[],
  date: Date = new Date(),
): string {
  const material =
    materialLabel
      .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "roll";
  const orders = orderNumbersFileNamePart(orderNumbers);
  const parts = ["layout"];
  if (orders) parts.push(orders);
  parts.push(material, date.toISOString().slice(0, 10));
  return `${parts.join("-")}.pdf`;
}
