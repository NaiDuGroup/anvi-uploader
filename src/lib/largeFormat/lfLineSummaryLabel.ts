import { parseLargeFormatLineData } from "./parseLargeFormatLineData";

export interface LfLineSummaryParts {
  materialName: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
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
  };
}
