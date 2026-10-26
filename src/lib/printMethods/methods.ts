/**
 * Print methods with a price list of print sizes and their own norms
 * (`PrintMethod` rows). Sublimation is priced per blank and has no entry here.
 */
export enum PrintMethodCode {
  Dtf = "dtf",
  Uv = "uv",
}

export const PRINT_METHOD_CODES: readonly PrintMethodCode[] = [PrintMethodCode.Dtf, PrintMethodCode.Uv];

export function isPrintMethodCode(value: unknown): value is PrintMethodCode {
  return typeof value === "string" && (PRINT_METHOD_CODES as readonly string[]).includes(value);
}

/** Admin page of a method's price list and norms. */
export function printMethodPagePath(code: PrintMethodCode): string {
  return `/admin/stock/print/${code}`;
}
