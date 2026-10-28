import { parseSublimationLineData, sublimationLineSource } from "./parseSublimationLineData";
import type { SublimationItemSource } from "./sublimationConstants";
import type { SublimationItemSnapshot, SublimationLineData } from "./types";

/** Customer-safe view of a sublimation line: which blank (or the client's item) and how many, without costs. */
export type SublimationPublicSummary = {
  source: SublimationItemSource;
  /** Stock blank; null for the client's item. */
  item: Pick<SublimationItemSnapshot, "name" | "names" | "variantLabel"> | null;
  clientItemDescription: string | null;
  /** «20×30 cm» of the client's item; null for stock blanks. */
  sizeLabel: string | null;
  quantity: number;
};

export function toSublimationPublicSummary(raw: unknown): SublimationPublicSummary | null {
  const data: SublimationLineData | null = parseSublimationLineData(raw);
  if (!data) return null;
  const c = data.clientItem ?? null;
  return {
    source: sublimationLineSource(data),
    item: data.item ? { name: data.item.name, names: data.item.names, variantLabel: data.item.variantLabel } : null,
    clientItemDescription: c?.description ?? null,
    sizeLabel: c ? `${c.widthCm}×${c.heightCm} cm` : null,
    quantity: data.quantity,
  };
}
