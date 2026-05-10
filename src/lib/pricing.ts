/**
 * Wholesale-vs-retail price selection.
 *
 * Dealers see `dealerPrice`; regular customers and anonymous visitors see
 * `sellPrice`. We never silently fall back across tiers when the dealer price
 * is missing on a product — that situation should be visible (returns null) so
 * the studio fixes the catalog rather than charging a dealer retail by mistake.
 */
export type PriceTier = "retail" | "dealer";

export interface ProductPriceInput {
  sellPrice: number | null;
  dealerPrice: number | null;
}

export function pickProductPrice(
  product: ProductPriceInput,
  isDealer: boolean,
): { displayPrice: number | null; priceTier: PriceTier } {
  if (isDealer) {
    return { displayPrice: product.dealerPrice, priceTier: "dealer" };
  }
  return { displayPrice: product.sellPrice, priceTier: "retail" };
}
