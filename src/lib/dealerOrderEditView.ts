import { toPublicProductSnapshot } from "@/lib/cabinetOrderLineView";

/**
 * What the dealer wizard needs to reopen an own order in edit mode, and
 * nothing more. The stored line JSON (DTF / UV / sublimation / large format /
 * sheets) carries purchase costs, consumption, margins and production
 * settings, so every line is rebuilt here from a whitelist of the fields the
 * wizard's hydration reads (`dtfDraftFromLineData`, `uvDraftFromLineData`,
 * `sublimationDraftFromLineData`, the LF / sheet prefill). The `consumption`,
 * `pricing` and `costs` keys the client parsers require are sent empty.
 */

type Json = Record<string, unknown>;

function obj(raw: unknown): Json | null {
  return raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Json) : null;
}

function pick(src: Json | null, keys: readonly string[]): Json {
  const out: Json = {};
  if (!src) return out;
  for (const k of keys) {
    if (k in src && src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

/** Placeholders for the keys the client parsers require (never the real figures). */
const EMPTY_FIGURES = { consumption: {}, pricing: {}, costs: {} } as const;

const DTF_ZONE_KEYS = ["id", "placement", "placementNote", "presetId", "customSize", "widthCm", "heightCm", "noPress"] as const;
const UV_ZONE_KEYS = ["id", "placement", "placementLabel", "widthCm", "heightCm", "whiteLayers", "varnish", "primer"] as const;

export function dealerEditDtfLineData(raw: unknown): Json | null {
  const d = obj(raw);
  if (!d || !Array.isArray(d.sizes) || !Array.isArray(d.zones)) return null;
  const garment = obj(d.garment);
  return {
    ...pick(d, ["version", "garmentSource", "customerType", "quantity", "layoutKey"]),
    garment: garment ? pick(garment, ["garmentProductId"]) : null,
    sizes: (d.sizes as unknown[]).map((s) => pick(obj(s), ["size", "quantity"])),
    zones: (d.zones as unknown[]).map((z) => pick(obj(z), DTF_ZONE_KEYS)),
    ...EMPTY_FIGURES,
  };
}

export function dealerEditUvLineData(raw: unknown): Json | null {
  const d = obj(raw);
  if (!d || !Array.isArray(d.zones)) return null;
  const item = obj(d.item);
  const clientItem = obj(d.clientItem);
  return {
    ...pick(d, ["version", "source", "technique", "customerType", "quantity"]),
    item: item ? pick(item, ["variantId"]) : null,
    clientItem: clientItem ? pick(clientItem, ["description", "notes"]) : null,
    zones: (d.zones as unknown[]).map((z) => pick(obj(z), UV_ZONE_KEYS)),
    ...EMPTY_FIGURES,
  };
}

export function dealerEditSublimationLineData(raw: unknown): Json | null {
  const d = obj(raw);
  if (!d) return null;
  const item = obj(d.item);
  const clientItem = obj(d.clientItem);
  return {
    ...pick(d, ["version", "source", "customerType", "quantity"]),
    item: item ? pick(item, ["variantId"]) : null,
    clientItem: clientItem ? pick(clientItem, ["description", "notes", "widthCm", "heightCm"]) : null,
    ...EMPTY_FIGURES,
  };
}

export function dealerEditLargeFormatLineData(raw: unknown): Json | null {
  const d = obj(raw);
  if (!d) return null;
  const material = obj(d.materialSnapshot);
  const preset = obj(d.sizePresetSnapshot);
  const finishing = obj(d.finishing);
  const kit = obj(d.kit);
  return {
    ...pick(d, ["printWidthCm", "printHeightCm", "quantity", "customerType", "materialFamilyKey", "pricingPolicy"]),
    materialSnapshot: material ? pick(material, ["id"]) : {},
    ...(preset ? { sizePresetSnapshot: pick(preset, ["presetId"]) } : {}),
    ...(finishing ? { finishing: pick(finishing, ["input"]) } : {}),
    ...(kit ? { kit: pick(kit, ["id"]) } : {}),
  };
}

export function dealerEditBusinessCardLineData(raw: unknown): Json | null {
  const d = obj(raw);
  if (!d) return null;
  const paper = obj(d.paperSnapshot);
  return {
    ...pick(d, [
      "quantity",
      "cardsPerSheet",
      "sheetsUsed",
      "cardWidthCm",
      "cardHeightCm",
      "cardTrimWidthCm",
      "cardTrimHeightCm",
      "bleedCm",
      "sides",
      "customerType",
      "presetId",
    ]),
    paperSnapshot: paper ? pick(paper, ["id"]) : {},
    layout: {},
  };
}

export interface DealerEditLineSource {
  id: string;
  sortOrder: number;
  productType: string;
  stockVariantId: string | null;
  largeFormatMaterialId: string | null;
  sheetPaperId: string | null;
  mugLayoutData: unknown;
  notebookLayoutData: unknown;
  penLayoutData: unknown;
  mugProductSnapshot: unknown;
  notebookProductSnapshot: unknown;
  penProductSnapshot: unknown;
  largeFormatLineData: unknown;
  businessCardLineData: unknown;
  dtfLineData: unknown;
  uvLineData: unknown;
  sublimationLineData: unknown;
  files: {
    id: string;
    fileName: string;
    copies: number;
    color: string;
    paperType: string | null;
    pageCount: number | null;
  }[];
}

/** One line for the dealer wizard's edit hydration (same shape as the admin GET, cost-free). */
export function toDealerEditLine(line: DealerEditLineSource) {
  return {
    id: line.id,
    sortOrder: line.sortOrder,
    productType: line.productType,
    stockVariantId: line.stockVariantId,
    largeFormatMaterialId: line.largeFormatMaterialId,
    sheetPaperId: line.sheetPaperId,
    // The dealer's own designs: text, fonts, colours and photo URLs they uploaded.
    mugLayoutData: line.mugLayoutData ?? null,
    notebookLayoutData: line.notebookLayoutData ?? null,
    penLayoutData: line.penLayoutData ?? null,
    mugProductSnapshot: toPublicProductSnapshot(line.mugProductSnapshot),
    notebookProductSnapshot: toPublicProductSnapshot(line.notebookProductSnapshot),
    penProductSnapshot: toPublicProductSnapshot(line.penProductSnapshot),
    largeFormatLineData: dealerEditLargeFormatLineData(line.largeFormatLineData),
    businessCardLineData: dealerEditBusinessCardLineData(line.businessCardLineData),
    dtfLineData: dealerEditDtfLineData(line.dtfLineData),
    uvLineData: dealerEditUvLineData(line.uvLineData),
    sublimationLineData: dealerEditSublimationLineData(line.sublimationLineData),
    files: line.files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      copies: f.copies,
      color: f.color,
      paperType: f.paperType,
      pageCount: f.pageCount,
    })),
  };
}

export type DealerEditLine = ReturnType<typeof toDealerEditLine>;
