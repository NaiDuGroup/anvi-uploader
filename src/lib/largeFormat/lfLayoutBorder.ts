/**
 * Per-material layout border rules for the workshop roll layout PDF.
 *
 * Some materials require extra blank (white) margin printed around every piece
 * so the workshop can finish the edges (hem / eyelets) without cutting into the
 * artwork. BANNER MATT is the first such material: every incoming file gets a
 * 4 cm white border added on all four sides (the piece grows by 8 cm per axis),
 * while staying 300 DPI and PDF. The artwork — including any contour already in
 * the file — is preserved unchanged inside the border.
 */

/** White margin (cm) added to each side of a BANNER MATT piece. */
export const LF_BANNER_MATT_BORDER_CM = 4;

/** Matches "BANNER MATT …" but not e.g. "BANNER Roll Up MATT …". */
const BANNER_MATT_PATTERN = /banner\s*matt/i;

/**
 * White border (cm) to add on every side of each piece for the given material.
 * Returns 0 when the material needs no border.
 */
export function resolveLayoutBorderCm(materialName: string | null | undefined): number {
  if (!materialName) return 0;
  if (BANNER_MATT_PATTERN.test(materialName)) return LF_BANNER_MATT_BORDER_CM;
  return 0;
}
