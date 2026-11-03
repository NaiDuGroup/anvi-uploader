import { parseSublimationLineData, sublimationLineSource } from "./parseSublimationLineData";
import type { SublimationItemSource } from "./sublimationConstants";
import type { SublimationItemSnapshot, SublimationLineData } from "./types";

/** Customer-safe view of a sublimation line: which blank (or the client's item) and how many, without costs. */
export type SublimationPublicSummary = {
  source: SublimationItemSource;
  /** Stock blank; null for the client's item. */
  item: Pick<SublimationItemSnapshot, "name" | "names" | "variantLabel" | "colorHex"> | null;
  /** Catalog code of the blank; production views only. */
  sku?: string | null;
  clientItemDescription: string | null;
  /** Staff notes on the client's item; production views only. */
  clientItemNotes?: string | null;
  /** «20×30 cm» of the client's item; null for stock blanks. */
  sizeLabel: string | null;
  quantity: number;
};

/** Customer-safe by default; `production: true` (staff views) adds the SKU and staff notes. */
export function toSublimationPublicSummary(
  raw: unknown,
  opts: { production?: boolean } = {},
): SublimationPublicSummary | null {
  const data: SublimationLineData | null = parseSublimationLineData(raw);
  if (!data) return null;
  const production: boolean = opts.production === true;
  const c = data.clientItem ?? null;
  return {
    source: sublimationLineSource(data),
    item: data.item
      ? {
          name: data.item.name,
          names: data.item.names,
          variantLabel: data.item.variantLabel,
          colorHex: data.item.colorHex ?? null,
        }
      : null,
    ...(production ? { sku: data.item?.sku ?? null, clientItemNotes: c?.notes ?? null } : {}),
    clientItemDescription: c?.description ?? null,
    sizeLabel: c ? `${c.widthCm}×${c.heightCm} cm` : null,
    quantity: data.quantity,
  };
}
