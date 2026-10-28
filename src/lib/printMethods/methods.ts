/**
 * Print methods with their own norms (`PrintMethod` rows). DTF also has a
 * price list of print sizes; UV is priced from the print parameters (area ×
 * rate per m²); sublimation is priced per blank (run-size tiers of the stock
 * variant) and only keeps usage norms per category.
 */
export enum PrintMethodCode {
  Dtf = "dtf",
  Uv = "uv",
  Sublimation = "sublimation",
}

export const PRINT_METHOD_CODES: readonly PrintMethodCode[] = [
  PrintMethodCode.Dtf,
  PrintMethodCode.Uv,
  PrintMethodCode.Sublimation,
];

/** Methods priced by a list of print sizes (`PrintPricePreset`). */
export const PRICE_LIST_PRINT_METHOD_CODES: readonly PrintMethodCode[] = [PrintMethodCode.Dtf];

export function printMethodHasPriceList(code: PrintMethodCode): boolean {
  return PRICE_LIST_PRINT_METHOD_CODES.includes(code);
}

export function isPrintMethodCode(value: unknown): value is PrintMethodCode {
  return typeof value === "string" && (PRINT_METHOD_CODES as readonly string[]).includes(value);
}

/** Admin page of a method's price list and norms. */
export function printMethodPagePath(code: PrintMethodCode): string {
  return `/admin/stock/print/${code}`;
}
