/**
 * Switch of the stock-aware storefront (server-only env `SHOP_STOCK_CHECK`).
 * Enabled only when exactly "1". Off (the default): the catalog sends no
 * balances to the pages (no «Nu e în stoc», no caps, nothing hidden) and the
 * checkout does not refuse lines for stock. Stock deduction on orders is the
 * same either way. Off until the stocktake makes the balances trustworthy.
 */
type Env = Readonly<Record<string, string | undefined>>;

export function shopStockCheckEnabled(env: Env = process.env): boolean {
  return env.SHOP_STOCK_CHECK?.trim() === "1";
}
