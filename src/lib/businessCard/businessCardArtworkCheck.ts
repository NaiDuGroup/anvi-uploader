/**
 * Checks that an uploaded business-card artwork carries the bleed.
 *
 * The press cuts inside the artwork, so a file has to be the finished (trim)
 * size plus {@link BUSINESS_CARD_BLEED_CM} on every side — 8.9 × 5.9 cm for an
 * 8.5 × 5.5 card. A file made at the finished size gets stretched over the
 * bleed footprint and loses its edges in the cut, so it must be stopped before
 * the order reaches the workshop.
 *
 * The comparison is orientation-free (a vertical card is the same card) and
 * leans on proportions first: they do not depend on resolution, and for every
 * non-square card the trim and bleed footprints have visibly different
 * proportions. Absolute size only decides the cases proportions cannot.
 */

import { layoutSizeFromTrim } from "./businessCardConstants";

export interface BusinessCardSizeCm {
  widthCm: number;
  heightCm: number;
}

export type BusinessCardArtworkIssue =
  /** Made at the finished size: the bleed is missing. */
  | "no_bleed"
  /** Right proportions, but smaller than the bleed footprint. */
  | "too_small"
  /** Neither the bleed footprint nor the finished size — wrong format chosen? */
  | "wrong_proportions";

export type BusinessCardArtworkCheck =
  | { ok: true; required: BusinessCardSizeCm; trim: BusinessCardSizeCm }
  | {
      ok: false;
      issue: BusinessCardArtworkIssue;
      actual: BusinessCardSizeCm;
      /** Bleed footprint the artwork must have. */
      required: BusinessCardSizeCm;
      /** Finished size the customer ordered. */
      trim: BusinessCardSizeCm;
    };

/**
 * Proportion tolerance on a log scale (≈1.2 %). Loose enough for exports that
 * round to whole pixels or to 1050 × 700, tight enough to tell 8.9 × 5.9
 * (1.508) from 8.5 × 5.5 (1.545) — those are 2.4 % apart.
 */
const ASPECT_LOG_TOLERANCE = 0.012;
/** Size slack for pixel rounding; the bleed itself is ~4–5 % of a card side. */
const SIZE_TOLERANCE = 0.02;

function longSideFirst(size: BusinessCardSizeCm): BusinessCardSizeCm {
  return size.widthCm >= size.heightCm
    ? size
    : { widthCm: size.heightCm, heightCm: size.widthCm };
}

function sameProportions(a: BusinessCardSizeCm, b: BusinessCardSizeCm): boolean {
  const ratioA = a.widthCm / a.heightCm;
  const ratioB = b.widthCm / b.heightCm;
  return Math.abs(Math.log(ratioA / ratioB)) <= ASPECT_LOG_TOLERANCE;
}

function atLeast(actual: BusinessCardSizeCm, required: BusinessCardSizeCm): boolean {
  return (
    actual.widthCm >= required.widthCm * (1 - SIZE_TOLERANCE) &&
    actual.heightCm >= required.heightCm * (1 - SIZE_TOLERANCE)
  );
}

function roughlyEqual(a: BusinessCardSizeCm, b: BusinessCardSizeCm): boolean {
  const close = (x: number, y: number): boolean =>
    Math.abs(x - y) <= y * SIZE_TOLERANCE;
  return close(a.widthCm, b.widthCm) && close(a.heightCm, b.heightCm);
}

export function checkBusinessCardArtwork(
  artwork: BusinessCardSizeCm,
  trim: BusinessCardSizeCm,
): BusinessCardArtworkCheck {
  const footprint = layoutSizeFromTrim(trim.widthCm, trim.heightCm);
  const required: BusinessCardSizeCm = {
    widthCm: footprint.cardWidthCm,
    heightCm: footprint.cardHeightCm,
  };

  const fail = (issue: BusinessCardArtworkIssue): BusinessCardArtworkCheck => ({
    ok: false,
    issue,
    actual: artwork,
    required,
    trim,
  });
  if (!(artwork.widthCm > 0) || !(artwork.heightCm > 0)) {
    return fail("wrong_proportions");
  }

  const a = longSideFirst(artwork);
  const r = longSideFirst(required);
  const t = longSideFirst(trim);

  const bleedShape = sameProportions(a, r);
  if (bleedShape && atLeast(a, r)) return { ok: true, required, trim };

  const trimShape = sameProportions(a, t);
  if (trimShape && !bleedShape) return fail("no_bleed");
  if (bleedShape) {
    // Near-square cards have the same proportions with and without bleed, so
    // only the size can tell a finished-size file from a low-resolution one.
    return fail(roughlyEqual(a, t) ? "no_bleed" : "too_small");
  }
  return fail("wrong_proportions");
}
