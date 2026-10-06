/** Studio standard business card face size (cm). */
export const BUSINESS_CARD_WIDTH_CM = 9.4;
export const BUSINESS_CARD_HEIGHT_CM = 5.4;

/** Default imposition sheet: A4+ (22.5 × 32 cm) — fits 4 × 3 = 12 standard cards. */
export const BUSINESS_CARD_SHEET_WIDTH_CM = 22.5;
export const BUSINESS_CARD_SHEET_HEIGHT_CM = 32;

/** Guard against absurd orders; one sheet holds 12, so this is ~250 sheets. */
export const BUSINESS_CARD_MAX_QUANTITY = 3000;

/** Card dimensions must stay within these bounds (cm) when overridden. */
export const BUSINESS_CARD_MIN_SIDE_CM = 2;
export const BUSINESS_CARD_MAX_SIDE_CM = 30;

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
