import type { LargeFormatLineData } from "./types";

export function parseLargeFormatLineData(raw: unknown): LargeFormatLineData | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.printWidthCm !== "number" ||
    typeof o.printHeightCm !== "number" ||
    typeof o.quantity !== "number" ||
    o.materialSnapshot == null ||
    typeof o.materialSnapshot !== "object"
  ) {
    return null;
  }
  return raw as LargeFormatLineData;
}
