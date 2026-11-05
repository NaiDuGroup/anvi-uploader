import { lfFinishingSummaryRu } from "./lfFinishing";
import { lfKitTitleRu } from "./lfKits";
import { parseLargeFormatLineData } from "./parseLargeFormatLineData";
import type { LargeFormatLineData } from "./types";

export interface LfLineSummaryParts {
  materialName: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
  /**
   * Staff text (Russian) of the line's extras: the roll-up / X-banner set
   * and / or the banner finishing; null without extras. Shown in the admin.
   */
  extrasRu: string | null;
}

/** Compact LF line facts for admin order list rows (material + size + qty). */
export function lfLineSummaryPartsFromRaw(raw: unknown): LfLineSummaryParts | null {
  const data = parseLargeFormatLineData(raw);
  if (!data) return null;

  const name = data.materialSnapshot?.name;
  if (typeof name !== "string" || name.trim() === "") return null;

  return {
    materialName: name.trim(),
    widthCm: data.printWidthCm,
    heightCm: data.printHeightCm,
    quantity: data.quantity,
    extrasRu: lfLineExtrasRu(data),
  };
}

/** «Roll-up 80×200 со стойкой» / «люверсы шаг ≤50 см по периметру (12 шт.), проклейка …»; null without extras. */
export function lfLineExtrasRu(data: { kit?: LargeFormatLineData["kit"]; finishing?: LargeFormatLineData["finishing"] }): string | null {
  const parts: string[] = [];
  if (data.kit) {
    parts.push(lfKitTitleRu(data.kit));
    if (data.kit.cornerEyelets) parts.push("люверсы по углам (4 шт.)");
  }
  const finishing: string = lfFinishingSummaryRu(data.finishing);
  if (finishing) parts.push(finishing);
  return parts.length ? parts.join(", ") : null;
}
