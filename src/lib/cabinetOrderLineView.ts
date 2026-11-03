import { toDtfPublicSummary, type DtfPublicSummary } from "@/lib/dtf/dtfPublicSummary";
import { toUvPublicSummary, type UvPublicSummary } from "@/lib/uv/uvPublicSummary";
import {
  toSublimationPublicSummary,
  type SublimationPublicSummary,
} from "@/lib/sublimation/sublimationPublicSummary";
import {
  lfLineSummaryPartsFromRaw,
  type LfLineSummaryParts,
} from "@/lib/largeFormat/lfLineSummaryLabel";
import {
  toSheetLinePublicSummary,
  type SheetLinePublicSummary,
} from "@/lib/businessCard/sheetLinePublicSummary";
import { isSheetProductType } from "@/lib/sheetProduct/sheetProductConfig";

/**
 * Keys of a frozen mug / notebook / pen snapshot the customer list may see:
 * names, picture and colours. Prices, purchase cost, dealer price and the SKU
 * are left out (whitelist, so a cost field added later never leaks).
 */
const SNAPSHOT_PUBLIC_KEYS = [
  "id",
  "nameRo",
  "nameRu",
  "nameEn",
  "name",
  "imageUrl",
  "isOther",
  "isFallback",
  // mug
  "bodyColorHex",
  "handleColorHex",
  "innerColorHex",
  "rimColorHex",
  // notebook
  "coverColorHex",
  "strapColorHex",
  "bookmarkColorHex",
  "paperKind",
  // pen
  "clipColorHex",
] as const;

export function toPublicProductSnapshot(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_PUBLIC_KEYS) {
    if (k in src) out[k] = src[k];
  }
  return out;
}

/** One position of an order as the customer's orders list shows it. */
export type CabinetOrderLineView = {
  id: string;
  productType: string;
  mugProductSnapshot: Record<string, unknown> | null;
  notebookProductSnapshot: Record<string, unknown> | null;
  penProductSnapshot: Record<string, unknown> | null;
  dtfSummary: DtfPublicSummary | null;
  uvSummary: UvPublicSummary | null;
  sublimationSummary: SublimationPublicSummary | null;
  largeFormatSummary: LfLineSummaryParts | null;
  sheetSummary: SheetLinePublicSummary | null;
};

export type CabinetOrderLineSource = {
  id: string;
  productType: string;
  mugProductSnapshot: unknown;
  notebookProductSnapshot: unknown;
  penProductSnapshot: unknown;
  largeFormatLineData: unknown;
  businessCardLineData: unknown;
  dtfLineData: unknown;
  uvLineData: unknown;
  sublimationLineData: unknown;
};

/**
 * Customer-safe digest of a position: what it is, never what it cost the studio.
 * `sheetImposition` adds sheets used / pieces per sheet (the order detail page
 * shows the run that way; the list keeps it short).
 */
export function toCabinetOrderLineView(
  line: CabinetOrderLineSource,
  opts: { sheetImposition?: boolean } = {},
): CabinetOrderLineView {
  const k = line.productType;
  return {
    id: line.id,
    productType: k,
    mugProductSnapshot: k === "mug" ? toPublicProductSnapshot(line.mugProductSnapshot) : null,
    notebookProductSnapshot:
      k === "notebook" ? toPublicProductSnapshot(line.notebookProductSnapshot) : null,
    penProductSnapshot: k === "pen" ? toPublicProductSnapshot(line.penProductSnapshot) : null,
    dtfSummary: k === "dtf_apparel" ? toDtfPublicSummary(line.dtfLineData) : null,
    uvSummary: k === "uv_print" ? toUvPublicSummary(line.uvLineData) : null,
    sublimationSummary:
      k === "sublimation_print" ? toSublimationPublicSummary(line.sublimationLineData) : null,
    largeFormatSummary:
      k === "large_format_print" ? lfLineSummaryPartsFromRaw(line.largeFormatLineData) : null,
    sheetSummary:
      isSheetProductType(k)
        ? toSheetLinePublicSummary(line.businessCardLineData, {
            production: opts.sheetImposition === true,
          })
        : null,
  };
}
