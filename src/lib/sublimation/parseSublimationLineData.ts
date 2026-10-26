import { SUBLIMATION_LINE_DATA_VERSION, type SublimationLineData } from "@/lib/sublimation/types";

/** Read `OrderLine.sublimationLineData`; null for missing or foreign shapes. */
export function parseSublimationLineData(raw: unknown): SublimationLineData | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Partial<SublimationLineData>;
  if (
    d.version !== SUBLIMATION_LINE_DATA_VERSION ||
    d.item == null ||
    typeof d.item.variantId !== "string" ||
    typeof d.quantity !== "number" ||
    d.consumption == null ||
    d.pricing == null ||
    d.costs == null
  ) {
    return null;
  }
  return d as SublimationLineData;
}
