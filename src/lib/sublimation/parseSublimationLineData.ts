import type { SublimationItemSource } from "@/lib/sublimation/sublimationConstants";
import { SUBLIMATION_LINE_DATA_VERSION, type SublimationLineData } from "@/lib/sublimation/types";

/** Who supplied the item; lines before client items existed have no `source` = «stock». */
export function sublimationLineSource(data: Pick<SublimationLineData, "source">): SublimationItemSource {
  return data.source === "client" ? "client" : "stock";
}

/**
 * Read `OrderLine.sublimationLineData`; null for missing or foreign shapes.
 * A stock line needs its blank, a client line its client item.
 */
export function parseSublimationLineData(raw: unknown): SublimationLineData | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Partial<SublimationLineData>;
  if (
    d.version !== SUBLIMATION_LINE_DATA_VERSION ||
    typeof d.quantity !== "number" ||
    d.consumption == null ||
    d.pricing == null ||
    d.costs == null
  ) {
    return null;
  }
  if (d.source === "client") {
    const c = d.clientItem;
    if (c == null || typeof c.description !== "string") return null;
    return { ...(d as SublimationLineData), item: null };
  }
  if (d.source != null && d.source !== "stock") return null;
  if (d.item == null || typeof d.item.variantId !== "string") return null;
  return d as SublimationLineData;
}
