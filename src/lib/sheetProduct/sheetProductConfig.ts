/**
 * Sheet products: pieces imposed in a uniform grid on one sheet of paper,
 * printed per sheet side and cut on a guillotine — business cards and flyers.
 * They share the paper catalog, stock, pricing, imposition and workshop
 * layout; this config is everything that differs between them.
 */

import {
  BUSINESS_CARD_BLEED_CM,
  BUSINESS_CARD_DEFAULT_PRESET_ID,
  BUSINESS_CARD_MAX_QUANTITY,
  BUSINESS_CARD_MAX_SIDE_CM,
  BUSINESS_CARD_MIN_SIDE_CM,
  BUSINESS_CARD_PRESET_IDS,
  BUSINESS_CARD_PRESETS,
  BUSINESS_CARD_SHEET_PRESETS,
  type BusinessCardPresetId,
} from "@/lib/businessCard/businessCardConstants";
import {
  FLYER_BLEED_CM,
  FLYER_DEFAULT_PRESET_ID,
  FLYER_MAX_QUANTITY,
  FLYER_MAX_SIDE_CM,
  FLYER_MIN_SIDE_CM,
  FLYER_PRESET_IDS,
  FLYER_PRESETS,
  FLYER_SHEET_PRESETS,
  type FlyerPresetId,
} from "@/lib/flyer/flyerConstants";

export const SHEET_PRODUCT_TYPES = ["business_card", "flyer"] as const;
export type SheetProductType = (typeof SHEET_PRODUCT_TYPES)[number];

export type SheetProductPresetId = BusinessCardPresetId | FlyerPresetId;

/** Every preset id of every sheet product, for request schemas. */
export const SHEET_PRODUCT_PRESET_IDS = [
  ...BUSINESS_CARD_PRESET_IDS,
  ...FLYER_PRESET_IDS.filter((id) => id !== "custom"),
] as const satisfies readonly SheetProductPresetId[];

export interface SheetProductPreset {
  readonly id: Exclude<SheetProductPresetId, "custom">;
  /** Paper-format name (e.g. "A6") when the size has one. */
  readonly name?: string;
  readonly trimWidthCm: number;
  readonly trimHeightCm: number;
}

export interface SheetProductConfig {
  readonly productType: SheetProductType;
  readonly presets: readonly SheetProductPreset[];
  readonly defaultPresetId: SheetProductPresetId;
  /** Bleed added to every side of the finished size (cm). */
  readonly bleedCm: number;
  readonly minSideCm: number;
  readonly maxSideCm: number;
  readonly maxQuantity: number;
  /** Run sizes offered in the order forms, in whole sheets. */
  readonly sheetPresets: readonly number[];
  /**
   * Artwork made at the finished size gets its bleed generated from the edges
   * when the workshop layout is built, instead of being rejected.
   */
  readonly generatesMissingBleed: boolean;
  /** Production setting `bcMinimumLineTotalMdl` lifts small runs. */
  readonly appliesMinimumLineTotal: boolean;
  /** Transliterated file-name prefix for the workshop layout. */
  readonly layoutFilePrefix: string;
}

const BUSINESS_CARD_CONFIG: SheetProductConfig = {
  productType: "business_card",
  presets: BUSINESS_CARD_PRESETS,
  defaultPresetId: BUSINESS_CARD_DEFAULT_PRESET_ID,
  bleedCm: BUSINESS_CARD_BLEED_CM,
  minSideCm: BUSINESS_CARD_MIN_SIDE_CM,
  maxSideCm: BUSINESS_CARD_MAX_SIDE_CM,
  maxQuantity: BUSINESS_CARD_MAX_QUANTITY,
  sheetPresets: BUSINESS_CARD_SHEET_PRESETS,
  generatesMissingBleed: false,
  appliesMinimumLineTotal: true,
  layoutFilePrefix: "vizitki",
};

const FLYER_CONFIG: SheetProductConfig = {
  productType: "flyer",
  presets: FLYER_PRESETS,
  defaultPresetId: FLYER_DEFAULT_PRESET_ID,
  bleedCm: FLYER_BLEED_CM,
  minSideCm: FLYER_MIN_SIDE_CM,
  maxSideCm: FLYER_MAX_SIDE_CM,
  maxQuantity: FLYER_MAX_QUANTITY,
  sheetPresets: FLYER_SHEET_PRESETS,
  generatesMissingBleed: true,
  appliesMinimumLineTotal: false,
  layoutFilePrefix: "flaery",
};

const CONFIG_BY_TYPE: Record<SheetProductType, SheetProductConfig> = {
  business_card: BUSINESS_CARD_CONFIG,
  flyer: FLYER_CONFIG,
};

export function isSheetProductType(value: unknown): value is SheetProductType {
  return (
    typeof value === "string" &&
    (SHEET_PRODUCT_TYPES as readonly string[]).includes(value)
  );
}

export function sheetProductConfig(productType: SheetProductType): SheetProductConfig {
  return CONFIG_BY_TYPE[productType];
}

export function findSheetProductPreset(
  productType: SheetProductType,
  id: string,
): SheetProductPreset | undefined {
  return CONFIG_BY_TYPE[productType].presets.find((preset) => preset.id === id);
}

/** True when `id` is `"custom"` or one of this product's own presets. */
export function isSheetProductPresetFor(
  productType: SheetProductType,
  id: string,
): boolean {
  return id === "custom" || findSheetProductPreset(productType, id) !== undefined;
}

/** Select label for a preset: "A6 · 10.5 × 14.8 cm", or just the size. */
export function sheetProductPresetLabel(preset: SheetProductPreset): string {
  const size = `${preset.trimWidthCm} × ${preset.trimHeightCm} cm`;
  return preset.name ? `${preset.name} · ${size}` : size;
}

/**
 * Trim size → the footprint one piece occupies on the sheet. Rounded to whole
 * micrometres so float noise never shifts a grid by a hair.
 */
export function sheetFootprintFromTrim(
  trimWidthCm: number,
  trimHeightCm: number,
  bleedCm: number,
): { cardWidthCm: number; cardHeightCm: number } {
  const grow = (cm: number): number => Math.round((cm + 2 * bleedCm) * 1000) / 1000;
  return { cardWidthCm: grow(trimWidthCm), cardHeightCm: grow(trimHeightCm) };
}

/** Paper weight bounds accepted in the paper catalog (g/m²). */
export const SHEET_PAPER_GSM_MIN = 60;
export const SHEET_PAPER_GSM_MAX = 500;
/** Weights the studio stocks for flyers, offered as quick picks in the catalog form. */
export const SHEET_PAPER_GSM_OPTIONS: readonly number[] = [105, 150, 200, 250, 300, 350];

/** Catalog name with the weight appended when the name does not already carry it. */
export function sheetPaperDisplayName(paper: { name: string; gsm?: number | null }): string {
  if (paper.gsm == null || paper.name.includes(String(paper.gsm))) {
    return paper.name;
  }
  return `${paper.name} · ${paper.gsm} g/m²`;
}
