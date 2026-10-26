import { UV_LINE_DATA_VERSION, type UvLineData } from "@/lib/uv/types";

/** Read `OrderLine.uvLineData`; null for missing or foreign shapes. */
export function parseUvLineData(raw: unknown): UvLineData | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Partial<UvLineData>;
  if (
    d.version !== UV_LINE_DATA_VERSION ||
    (d.source !== "stock" && d.source !== "client") ||
    typeof d.quantity !== "number" ||
    !Array.isArray(d.zones) ||
    d.consumption == null ||
    d.pricing == null ||
    d.costs == null
  ) {
    return null;
  }
  return d as UvLineData;
}
