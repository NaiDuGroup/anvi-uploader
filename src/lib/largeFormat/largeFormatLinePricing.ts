import type { LargeFormatCustomerType } from "./types";

export interface LargeFormatPricingMaterialInput {
  costPerLinearMeter: number;
  finalRetailPricePerLinearMeter: number;
  finalDealerPricePerLinearMeter: number;
  /** Legacy catalog split; used only when both unified finals are 0. */
  dealerPricePerLinearMeter: number;
  retailPricePerLinearMeter: number;
  dealerPrintPricePerLinearMeter: number;
  retailPrintPricePerLinearMeter: number;
}

/** One catalog sell rate per linear meter after unified pricing (retail or dealer). */
export function effectiveLfSellRatePerLinearMeterMdl(
  customerType: LargeFormatCustomerType,
  m: LargeFormatPricingMaterialInput,
): number {
  const fin =
    customerType === "dealer"
      ? m.finalDealerPricePerLinearMeter
      : m.finalRetailPricePerLinearMeter;
  if (fin > 0) {
    return fin;
  }
  return Math.max(
    0,
    customerType === "dealer"
      ? m.dealerPricePerLinearMeter + m.dealerPrintPricePerLinearMeter
      : m.retailPricePerLinearMeter + m.retailPrintPricePerLinearMeter,
  );
}

/** MDL integer rounding: non-negative only. */
export function roundMoneyMdl(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** Uses precomputed linear meters from roll packing (`largeFormatRollPack`). */
export function computeLargeFormatLinePricing(input: {
  calculatedLinearMeters: number;
  customerType: LargeFormatCustomerType;
  material: LargeFormatPricingMaterialInput;
}): {
  calculatedLinearMeters: number;
  materialCost: number;
  materialSellPrice: number;
  printSellPrice: number;
  totalSellPrice: number;
  estimatedProfit: number;
} {
  const { calculatedLinearMeters: metersIn, customerType, material } = input;
  const calculatedLinearMeters = Number.isFinite(metersIn) && metersIn >= 0 ? metersIn : 0;

  const sellRatePerLm = effectiveLfSellRatePerLinearMeterMdl(customerType, material);

  const materialCost = roundMoneyMdl(calculatedLinearMeters * material.costPerLinearMeter);
  const materialSellPrice = roundMoneyMdl(calculatedLinearMeters * sellRatePerLm);
  const printSellPrice = 0;
  /** Material revenue only until ink markup merge (`mergeLfPricingWithInkSell`). */
  const totalSellPrice = materialSellPrice;
  const estimatedProfit = totalSellPrice - materialCost;

  return {
    calculatedLinearMeters,
    materialCost,
    materialSellPrice,
    printSellPrice,
    totalSellPrice,
    estimatedProfit,
  };
}
