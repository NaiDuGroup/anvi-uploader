import type { BusinessCardLineData } from "./types";

export function parseBusinessCardLineData(raw: unknown): BusinessCardLineData | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.quantity !== "number" ||
    typeof o.cardsPerSheet !== "number" ||
    typeof o.sheetsUsed !== "number" ||
    typeof o.cardWidthCm !== "number" ||
    typeof o.cardHeightCm !== "number" ||
    o.paperSnapshot == null ||
    typeof o.paperSnapshot !== "object" ||
    o.layout == null ||
    typeof o.layout !== "object"
  ) {
    return null;
  }
  return raw as BusinessCardLineData;
}
