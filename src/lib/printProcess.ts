import type { ProductType } from "@/lib/validations";

/**
 * Printing / equipment line for ink COGS — not the same as catalog `ProductType`.
 * - large_format_roll: roll wide-format printer (eco-solvent/latex/solvent, etc.)
 * - uv_rigid: UV flatbed / cylinder on rigid substrates & promo items
 * - dtf_textile: DTF film → textile transfer (t-shirts, etc.)
 */
export const PRINT_PROCESSES = [
  "large_format_roll",
  "uv_rigid",
  "dtf_textile",
] as const;

export type PrintProcess = (typeof PRINT_PROCESSES)[number];

/** Legacy ink rows and wide-format economics default to this tank. */
export const DEFAULT_PRINT_PROCESS: PrintProcess = "large_format_roll";

export function isPrintProcess(value: string): value is PrintProcess {
  return (PRINT_PROCESSES as readonly string[]).includes(value);
}

export function parsePrintProcess(
  value: unknown,
  fallback: PrintProcess = DEFAULT_PRINT_PROCESS,
): PrintProcess {
  if (typeof value === "string" && isPrintProcess(value)) {
    return value;
  }
  return fallback;
}

/**
 * Which ink tank is used for COGS for a catalog order line. Extend when notebook/mug ink
 * norms are modeled; LF always uses the roll-ink tank.
 */
export function printProcessForProductType(productType: ProductType): PrintProcess {
  switch (productType) {
    case "large_format_print":
      return "large_format_roll";
    case "notebook":
      return "uv_rigid";
    case "mug":
      return "uv_rigid";
    case "paper_print":
    default:
      return "uv_rigid";
  }
}
