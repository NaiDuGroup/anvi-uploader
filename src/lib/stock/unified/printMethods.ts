import { z } from "zod";

/**
 * `StockCategory.printMethods`: which studio print processes use items of the
 * category as blanks. Only DTF today; add "uv" etc. here when they arrive.
 */
export enum PrintMethod {
  Dtf = "dtf",
}

export const PRINT_METHODS: readonly PrintMethod[] = [PrintMethod.Dtf];

export function isPrintMethod(value: unknown): value is PrintMethod {
  return typeof value === "string" && (PRINT_METHODS as readonly string[]).includes(value);
}

/** Request body field: known methods only, duplicates collapsed, stored in `PRINT_METHODS` order. */
export const printMethodsSchema = z
  .array(z.enum(PRINT_METHODS as unknown as [PrintMethod, ...PrintMethod[]]))
  .max(PRINT_METHODS.length * 2)
  .transform((methods) => PRINT_METHODS.filter((m) => methods.includes(m)));

/** Tolerant read of the DB column (unknown values are dropped). */
export function parsePrintMethods(raw: readonly string[] | null | undefined): PrintMethod[] {
  const present: string[] = raw ? [...raw] : [];
  return PRINT_METHODS.filter((m) => present.includes(m));
}

export function categoryPrintsDtf(category: { printMethods: readonly string[] }): boolean {
  return category.printMethods.includes(PrintMethod.Dtf);
}
