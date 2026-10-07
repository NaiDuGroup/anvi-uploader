/**
 * Bleed added to every side of the trim size before imposition (cm). Customers
 * pick the finished card they will receive; artwork arrives at trim + bleed and
 * that larger footprint is what actually competes for room on the sheet.
 */
export const BUSINESS_CARD_BLEED_CM = 0.2;

/**
 * Finished card sizes the studio offers (cm, after cutting). The id is frozen
 * on the order line, so never reuse one for a different size.
 */
export const BUSINESS_CARD_PRESETS = [
  { id: "trim_90x50", trimWidthCm: 9, trimHeightCm: 5 },
  { id: "trim_85x55", trimWidthCm: 8.5, trimHeightCm: 5.5 },
] as const;

export type BusinessCardPreset = (typeof BUSINESS_CARD_PRESETS)[number];
/** `"custom"` = free-form size typed by the customer. */
export type BusinessCardPresetId = BusinessCardPreset["id"] | "custom";

/** Every accepted id, for request schemas. */
export const BUSINESS_CARD_PRESET_IDS = [
  "trim_90x50",
  "trim_85x55",
  "custom",
] as const satisfies readonly BusinessCardPresetId[];

export const BUSINESS_CARD_DEFAULT_PRESET_ID: BusinessCardPresetId = "trim_90x50";

export function findBusinessCardPreset(
  id: string,
): BusinessCardPreset | undefined {
  return BUSINESS_CARD_PRESETS.find((preset) => preset.id === id);
}

export function isBusinessCardPresetId(
  value: unknown,
): value is BusinessCardPresetId {
  return (
    value === "custom" ||
    (typeof value === "string" && findBusinessCardPreset(value) !== undefined)
  );
}

/**
 * Trim size → the footprint one card occupies on the sheet. Rounded to whole
 * millimetres so float noise never shifts a grid by a hair.
 */
export function layoutSizeFromTrim(
  trimWidthCm: number,
  trimHeightCm: number,
): { cardWidthCm: number; cardHeightCm: number } {
  const grow = (cm: number): number =>
    Math.round((cm + 2 * BUSINESS_CARD_BLEED_CM) * 1000) / 1000;
  return {
    cardWidthCm: grow(trimWidthCm),
    cardHeightCm: grow(trimHeightCm),
  };
}

/** Standard trim 9 × 5 grows to 9.4 × 5.4 on the sheet. */
export const BUSINESS_CARD_WIDTH_CM = layoutSizeFromTrim(9, 5).cardWidthCm;
export const BUSINESS_CARD_HEIGHT_CM = layoutSizeFromTrim(9, 5).cardHeightCm;

/** Default imposition sheet: A4+ (22.5 × 32 cm) — fits 4 × 3 = 12 standard cards. */
export const BUSINESS_CARD_SHEET_WIDTH_CM = 22.5;
export const BUSINESS_CARD_SHEET_HEIGHT_CM = 32;

/** Guard against absurd orders; one sheet holds 10–12, so this is ~250 sheets. */
export const BUSINESS_CARD_MAX_QUANTITY = 3000;

/** Trim dimensions must stay within these bounds (cm) when overridden. */
export const BUSINESS_CARD_MIN_SIDE_CM = 2;
export const BUSINESS_CARD_MAX_SIDE_CM = 30;

/**
 * Run sizes offered in the order forms, expressed in whole sheets. Quoting the
 * presets in sheets (rather than cards) keeps every option an exact multiple of
 * whatever the chosen standard fits per sheet, so no sheet is ever half empty.
 */
export const BUSINESS_CARD_SHEET_PRESETS = [1, 2, 5, 10, 25, 50, 100] as const;

/**
 * A run must fill whole sheets: the studio prints and cuts by the sheet, so a
 * tail sheet carrying a single card is pure waste. Rounds up to the next
 * multiple of `cardsPerSheet`.
 */
export function snapQuantityToWholeSheets(
  quantity: number,
  cardsPerSheet: number,
): number {
  if (!(cardsPerSheet > 0)) return quantity;
  if (!Number.isFinite(quantity) || quantity < 1) return cardsPerSheet;
  return Math.ceil(quantity / cardsPerSheet) * cardsPerSheet;
}

/**
 * Re-fits a run that was already whole sheets to a new sheet capacity (another
 * card size or paper) by rounding to the nearest whole sheet, never below one.
 * Rounding up here instead would ratchet the run on every switch back and
 * forth — 1000 → 1008 (12) → 1010 (10) → 1020 (12) — while nearest returns to
 * where it started.
 */
export function refitQuantityToWholeSheets(
  quantity: number,
  cardsPerSheet: number,
): number {
  if (!(cardsPerSheet > 0)) return quantity;
  if (!Number.isFinite(quantity) || quantity < 1) return cardsPerSheet;
  return Math.max(1, Math.round(quantity / cardsPerSheet)) * cardsPerSheet;
}

export function isWholeSheetQuantity(
  quantity: number,
  cardsPerSheet: number,
): boolean {
  if (!(cardsPerSheet > 0)) return false;
  return Number.isInteger(quantity) && quantity > 0 && quantity % cardsPerSheet === 0;
}

export const BUSINESS_CARD_SIDES = ["one", "two"] as const;
export type BusinessCardSides = (typeof BUSINESS_CARD_SIDES)[number];

export function isBusinessCardSides(value: unknown): value is BusinessCardSides {
  return (
    typeof value === "string" &&
    (BUSINESS_CARD_SIDES as readonly string[]).includes(value)
  );
}

/** How many printed passes a sheet needs — drives the per-sheet sell rate. */
export function sidesMultiplier(sides: BusinessCardSides): number {
  return sides === "two" ? 2 : 1;
}

/**
 * `File.paperType` tags that mark which face an artwork belongs to. Files carry
 * no sort column, so the imposition PDF relies on these tags to put the front
 * on page 1 and the back on page 2.
 */
export const BUSINESS_CARD_FRONT_PAPER_TYPE = "business_card_front";
export const BUSINESS_CARD_BACK_PAPER_TYPE = "business_card_back";

/**
 * Split the files of one business-card line into printed faces. A double-sided
 * run keeps both artworks on a single line, so every consumer — the imposition
 * PDF and the admin editor alike — has to agree on which file is which. Orders
 * created before the side tags existed fall back to the stable id order they
 * were inserted in.
 */
export function businessCardFaces<
  T extends { id: string; paperType: string | null },
>(files: readonly T[]): { front: T | null; back: T | null } {
  const byId = [...files].sort((a, b) => a.id.localeCompare(b.id));
  // Resolve the reverse tag first: an untagged file paired with a tagged back
  // is the front, however the two sort.
  const taggedBack = byId.find(
    (f) => f.paperType === BUSINESS_CARD_BACK_PAPER_TYPE,
  );
  const front =
    byId.find((f) => f.paperType === BUSINESS_CARD_FRONT_PAPER_TYPE) ??
    byId.find((f) => f.id !== taggedBack?.id) ??
    null;
  const back = taggedBack ?? byId.find((f) => f.id !== front?.id) ?? null;
  return { front, back };
}
