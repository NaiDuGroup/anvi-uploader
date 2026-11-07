import { UV_DTF_WHITE_LAYERS } from "@/lib/uv/uvConstants";
import { UV_LINE_DATA_VERSION, type UvLineData } from "@/lib/uv/types";

/**
 * Read `OrderLine.uvLineData`; null for missing or foreign shapes. UV-DTF zones
 * always read as two white layers (lines saved before 2026-11-07 could hold others).
 */
export function parseUvLineData(raw: unknown): UvLineData | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Partial<UvLineData>;
  if (
    d.version !== UV_LINE_DATA_VERSION ||
    (d.source !== "stock" && d.source !== "client" && d.source !== "stickers") ||
    typeof d.quantity !== "number" ||
    !Array.isArray(d.zones) ||
    d.consumption == null ||
    d.pricing == null ||
    d.costs == null
  ) {
    return null;
  }
  const data = d as UvLineData;
  if (data.technique === "transfer" && data.zones.some((z) => z.whiteLayers !== UV_DTF_WHITE_LAYERS)) {
    return { ...data, zones: data.zones.map((z) => ({ ...z, whiteLayers: UV_DTF_WHITE_LAYERS })) };
  }
  return data;
}
