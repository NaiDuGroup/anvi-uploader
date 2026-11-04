/**
 * Line total of a pen line priced per piece: `unit × quantity` rounded to
 * whole lei (owner, 2026-11: pens «without bani»). The capped run-size unit is
 * total / quantity to the cent (24 pens = 36.46), so 36.46 × 24 = 875.04 → 875.
 * Pure, safe on the client. Only pens — other items keep bani.
 */
export function penLineTotalMdl(unitMdl: number, quantity: number): number {
  return Math.round(unitMdl * quantity);
}
