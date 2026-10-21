/**
 * Flyers: printed on the same sheet papers as business cards (A4+ and the
 * like) and imposed the same way, but in many finished sizes. The workshop
 * cuts inside the artwork, so every flyer grows by a bleed on each side —
 * the operator used to paint it by hand; the layout now generates it.
 */

/** Bleed per side (cm): +0.4 cm on width and height in total. */
export const FLYER_BLEED_CM = 0.2;

/**
 * Finished flyer sizes the studio offers (cm, after cutting). The id is frozen
 * on the order line, so never reuse one for a different size.
 */
export const FLYER_PRESETS = [
  { id: "flyer_a6", name: "A6", trimWidthCm: 10.5, trimHeightCm: 14.8 },
  { id: "flyer_a5", name: "A5", trimWidthCm: 14.8, trimHeightCm: 21 },
  { id: "flyer_dl", name: "DL", trimWidthCm: 9.9, trimHeightCm: 21 },
  { id: "flyer_a4", name: "A4", trimWidthCm: 21, trimHeightCm: 29.7 },
  { id: "flyer_150x70", trimWidthCm: 15, trimHeightCm: 7 },
] as const;

export type FlyerPreset = (typeof FLYER_PRESETS)[number];
/** `"custom"` = free-form size typed by the customer. */
export type FlyerPresetId = FlyerPreset["id"] | "custom";

/** Every accepted id, for request schemas. */
export const FLYER_PRESET_IDS = [
  "flyer_a6",
  "flyer_a5",
  "flyer_dl",
  "flyer_a4",
  "flyer_150x70",
  "custom",
] as const satisfies readonly FlyerPresetId[];

export const FLYER_DEFAULT_PRESET_ID: FlyerPresetId = "flyer_a6";

/** Trim dimensions must stay within these bounds (cm) for a custom size. */
export const FLYER_MIN_SIDE_CM = 3;
export const FLYER_MAX_SIDE_CM = 32;

/** Guard against absurd orders; small flyers fit up to ~16 per sheet. */
export const FLYER_MAX_QUANTITY = 20000;

/** Run sizes offered in the order forms, expressed in whole sheets. */
export const FLYER_SHEET_PRESETS = [1, 5, 10, 25, 50, 100, 250] as const;
