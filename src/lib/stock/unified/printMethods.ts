import { z } from "zod";

/**
 * `StockCategory.printMethods`: which studio print processes use items of the
 * category as blanks: DTF (garments), UV (pens, notebooks, …) and
 * sublimation on the Epson L1800 (mugs, pillows, puzzles, keychains, …).
 */
export enum PrintMethod {
  Dtf = "dtf",
  Uv = "uv",
  Sublimation = "sublimation",
}

export const PRINT_METHODS: readonly PrintMethod[] = [PrintMethod.Dtf, PrintMethod.Uv, PrintMethod.Sublimation];

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

export function categoryPrintsUv(category: { printMethods: readonly string[] }): boolean {
  return category.printMethods.includes(PrintMethod.Uv);
}

export function categoryPrintsSublimation(category: { printMethods: readonly string[] }): boolean {
  return category.printMethods.includes(PrintMethod.Sublimation);
}

/**
 * Run-size price tiers of a category's items: per colour for DTF garments (all
 * sizes of a colour share them), per variant for other printed blanks (UV,
 * sublimation — e.g. each pillow fabric or puzzle format has its own prices),
 * none for categories nobody prints on.
 */
export type PriceTierScope = "color" | "variant";

export function priceTierScope(category: { printMethods: readonly string[] }): PriceTierScope | null {
  if (categoryPrintsDtf(category)) return "color";
  return parsePrintMethods(category.printMethods).length > 0 ? "variant" : null;
}
