import { parseSublimationLineData } from "./parseSublimationLineData";
import type { SublimationLineData } from "./types";

/** Customer-safe view of a sublimation line: which blank and how many, without costs. */
export type SublimationPublicSummary = {
  item: Pick<SublimationLineData["item"], "name" | "names" | "variantLabel">;
  quantity: number;
};

export function toSublimationPublicSummary(raw: unknown): SublimationPublicSummary | null {
  const data: SublimationLineData | null = parseSublimationLineData(raw);
  if (!data) return null;
  return {
    item: { name: data.item.name, names: data.item.names, variantLabel: data.item.variantLabel },
    quantity: data.quantity,
  };
}
