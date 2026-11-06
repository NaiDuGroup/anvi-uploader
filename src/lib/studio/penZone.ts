/**
 * ONE rule for the print zone of a Studio pen (barrel / pencil / case), used
 * by the editor and its preview (`studioUvPrintCm` → the canvas and the print
 * file), `/api/pen-products` and the checkout check (`shopUvItemZoneError`
 * accepts it: see `penZone.test.ts`). Pure, no imports (the catalog, the API
 * and the client all read it).
 *
 * - A pen set printed on its case (`case`, KIOTO): the item card's print area,
 *   else the product's fallback zone.
 * - A pen or a pencil: the card's print area when it fits on a barrel (at most
 *   `PEN_BARREL_MAX_HEIGHT_CM` high). Taller is not a barrel zone — the
 *   4×1.5 cm the pen card form stores by default (LOIS / PARTAS on prod) — so
 *   the product's proposed barrel zone is used instead, else the conservative
 *   barrel default (`PEN_BARREL_DEFAULT_CM`, like ARDENES 5×0.6).
 *
 * A card with a print area makes the UV engine price that card size whatever
 * size the line carries; without one the line carries the fallback zone,
 * which is what this returns — so the checkout always accepts the file.
 */

export type StudioPenShape = "pen" | "pencil" | "case";

export interface PenZoneCm {
  widthCm: number;
  heightCm: number;
}

/** Conservative print zone on a pen barrel when nothing measured is known. */
export const PEN_BARREL_DEFAULT_CM: PenZoneCm = { widthCm: 4, heightCm: 0.6 };

/** Highest print that still sits on the visible side of a ~1 cm barrel. */
export const PEN_BARREL_MAX_HEIGHT_CM = 1;

function valid(z: PenZoneCm | null | undefined): z is PenZoneCm {
  return !!z && Number.isFinite(z.widthCm) && Number.isFinite(z.heightCm) && z.widthCm > 0 && z.heightCm > 0;
}

/**
 * The print zone (cm) of a Studio pen product.
 * `card` = the item card's own print area (null when the card has none),
 * `fallback` = the product's `fallbackPrintAreaCm`.
 */
export function studioPenZoneCm(shape: StudioPenShape | null | undefined, card: PenZoneCm | null | undefined, fallback: PenZoneCm | null | undefined): PenZoneCm {
  const pick = (z: PenZoneCm): PenZoneCm => ({ widthCm: z.widthCm, heightCm: z.heightCm });
  if (shape === "case") {
    if (valid(card)) return pick(card);
    if (valid(fallback)) return pick(fallback);
    return pick(PEN_BARREL_DEFAULT_CM);
  }
  if (valid(card) && card.heightCm <= PEN_BARREL_MAX_HEIGHT_CM + 1e-9) return pick(card);
  if (valid(fallback) && fallback.heightCm <= PEN_BARREL_MAX_HEIGHT_CM + 1e-9) return pick(fallback);
  return pick(PEN_BARREL_DEFAULT_CM);
}
