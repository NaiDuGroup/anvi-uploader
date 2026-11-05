/**
 * «14,5×21 cm» size text of a UV zone / print area, with the unit of the
 * admin UI language (`t.uv.editor.cm`) and the caller's number format.
 */
export function uvSizeCmLabel(
  widthCm: number,
  heightCm: number,
  cmUnit: string,
  formatNumber: (n: number) => string = String,
): string {
  return `${formatNumber(widthCm)}×${formatNumber(heightCm)} ${cmUnit}`;
}
