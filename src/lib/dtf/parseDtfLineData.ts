import { DTF_LINE_DATA_VERSION, type DtfLineData } from "@/lib/dtf/types";

/** Read `OrderLine.dtfLineData`; null for missing or foreign shapes. */
export function parseDtfLineData(raw: unknown): DtfLineData | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Partial<DtfLineData>;
  if (
    d.version !== DTF_LINE_DATA_VERSION ||
    !Array.isArray(d.sizes) ||
    !Array.isArray(d.zones) ||
    d.consumption == null ||
    d.pricing == null ||
    d.costs == null
  ) {
    return null;
  }
  return d as DtfLineData;
}
