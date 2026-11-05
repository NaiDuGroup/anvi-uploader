import { inStock } from "@/lib/storefront/stock";
import type { ShopVariant } from "@/lib/storefront/types";

/**
 * The product colours the Studio offers, from one list for every place that
 * shows them (editor header swatches and the «Verifică designul» picker), so
 * both always show the same colours in the same order — all of them (no
 * header cut-off). Out-of-stock colours stay listed, disabled. Pure.
 */

export interface StudioColorChoice {
  key: string;
  label: string;
  hex: string;
  disabled: boolean;
}

export function studioColorChoices(variants: readonly Pick<ShopVariant, "id" | "label" | "hex" | "stock">[]): StudioColorChoice[] {
  return variants.map((v) => ({ key: v.id, label: v.label, hex: v.hex, disabled: !inStock(v.stock) }));
}

/** A colour choice is shown only when there is something to choose. */
export function hasColorChoice(choices: readonly StudioColorChoice[]): boolean {
  return choices.length > 1;
}
