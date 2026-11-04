import type { ShopDeliveryMethod } from "./constants";

/**
 * Server-side delivery tariff (MDL, VAT incl.). No free-delivery threshold.
 * The Moldova-wide courier price changes in season: set
 * `SHOP_DELIVERY_MOLDOVA_MDL` (default 60; 70 in season).
 */
export const SHOP_DELIVERY_PRICE_PICKUP_MDL = 0;
export const SHOP_DELIVERY_PRICE_CHISINAU_MDL = 45;
export const SHOP_DELIVERY_PRICE_MOLDOVA_DEFAULT_MDL = 60;

type Env = Readonly<Record<string, string | undefined>>;

/** Moldova-wide courier price: `SHOP_DELIVERY_MOLDOVA_MDL` when it is a sane number, else 60. */
export function moldovaDeliveryPriceMdl(env: Env = process.env): number {
  const raw = env.SHOP_DELIVERY_MOLDOVA_MDL?.trim();
  if (!raw) return SHOP_DELIVERY_PRICE_MOLDOVA_DEFAULT_MDL;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) / 100 : SHOP_DELIVERY_PRICE_MOLDOVA_DEFAULT_MDL;
}

export function shopDeliveryPriceMdl(method: ShopDeliveryMethod, env: Env = process.env): number {
  switch (method) {
    case "pickup":
      return SHOP_DELIVERY_PRICE_PICKUP_MDL;
    case "courier_chisinau":
      return SHOP_DELIVERY_PRICE_CHISINAU_MDL;
    case "courier_moldova":
      return moldovaDeliveryPriceMdl(env);
  }
}
