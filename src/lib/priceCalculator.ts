interface PriceTier {
  minQty: number;
  maxQty: number | null;
  price: number;
  totalFixed?: number | null;
}

interface Surcharge {
  key: string;
  label: Record<string, string>;
  pricePerUnit: number;
}

type PricingModel = "fixed" | "per_unit" | "per_sqm";

export interface PriceCalcCategory {
  pricingModel: PricingModel;
  servicePriceDefault: number | null;
  dimensionsRequired: boolean;
  surcharges: Surcharge[] | null;
}

export interface PriceCalcProduct {
  sellingPrice: number | null;
  priceTiers: PriceTier[] | null;
}

export interface PriceCalcItem {
  quantity: number;
  width?: number;
  height?: number;
  activeSurchargeKeys?: string[];
}

export interface PriceResult {
  unitPrice: number;
  totalPrice: number;
  surchargesTotal: number;
  breakdown: string;
}

function lookupTierPrice(
  tiers: PriceTier[],
  quantity: number,
): { price: number; totalFixed: number | null } | null {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);

  let matched: PriceTier | null = null;
  for (const tier of sorted) {
    if (quantity >= tier.minQty) {
      if (!tier.maxQty || quantity <= tier.maxQty) {
        matched = tier;
      }
    }
  }

  if (!matched) {
    if (sorted.length > 0 && quantity < sorted[0].minQty) {
      matched = sorted[0];
    }
  }

  if (!matched) return null;
  return { price: matched.price, totalFixed: matched.totalFixed ?? null };
}

export function calculatePrice(
  category: PriceCalcCategory | undefined,
  product: PriceCalcProduct | undefined,
  item: PriceCalcItem,
): PriceResult | null {
  if (!category) return null;

  const model = category.pricingModel;
  const servicePrice = category.servicePriceDefault ?? 0;
  const sellingPrice = product?.sellingPrice ?? 0;
  const quantity = item.quantity;

  let unitPrice = 0;
  let totalPrice = 0;
  let breakdown = "";

  if (product?.priceTiers && product.priceTiers.length > 0) {
    const tierResult = lookupTierPrice(product.priceTiers, quantity);
    if (tierResult) {
      if (tierResult.totalFixed) {
        totalPrice = tierResult.totalFixed;
        unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
        breakdown = `${totalPrice} (fixed for ${quantity})`;
      } else {
        unitPrice = tierResult.price;
        totalPrice = unitPrice * quantity;
        breakdown = `${unitPrice} × ${quantity}`;
      }
    } else {
      unitPrice = sellingPrice;
      totalPrice = unitPrice * quantity;
      breakdown = `${unitPrice} × ${quantity}`;
    }
  } else if (model === "fixed") {
    if (!sellingPrice) return null;
    unitPrice = sellingPrice;
    totalPrice = sellingPrice * quantity;
    breakdown = `${unitPrice} × ${quantity}`;
  } else if (model === "per_sqm") {
    const w = item.width ?? 0;
    const h = item.height ?? 0;
    if (!w || !h || !servicePrice) return null;
    const areaSqm = (w * h) / 10000;
    unitPrice = Math.round((areaSqm * servicePrice + sellingPrice) * 100) / 100;
    totalPrice = Math.round(unitPrice * quantity * 100) / 100;
    breakdown = `(${w}×${h}cm = ${areaSqm.toFixed(4)}m²) × ${servicePrice}/m²`;
    if (sellingPrice) breakdown += ` + ${sellingPrice} product`;
    breakdown += ` = ${unitPrice} × ${quantity}`;
  } else if (model === "per_unit") {
    unitPrice = sellingPrice + servicePrice;
    if (!unitPrice) return null;
    totalPrice = unitPrice * quantity;
    breakdown = `(${sellingPrice} + ${servicePrice} service) × ${quantity}`;
  } else {
    return null;
  }

  let surchargesTotal = 0;
  if (category.surcharges && item.activeSurchargeKeys) {
    for (const sc of category.surcharges) {
      if (item.activeSurchargeKeys.includes(sc.key)) {
        surchargesTotal += sc.pricePerUnit * quantity;
      }
    }
  }

  totalPrice = Math.round((totalPrice + surchargesTotal) * 100) / 100;
  if (surchargesTotal > 0) {
    unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
  }

  return { unitPrice, totalPrice, surchargesTotal, breakdown };
}
