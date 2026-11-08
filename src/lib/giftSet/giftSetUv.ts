import type { UvLineData } from "@/lib/uv/types";
import type { GiftSetTemplate } from "./giftSet";
import type { UvLineInput } from "@/lib/uv/uvLineInput";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * UV input of a ready set (C): the set item's colour variant, N pieces, one
 * zone per printed component (placement «other» with the component's name,
 * the template's size). White / varnish as the UV defaults.
 */
export function readyGiftSetUvInput(template: GiftSetTemplate, variantId: string, quantity: number): UvLineInput {
  return {
    source: "stock",
    technique: "direct",
    variantId,
    quantity,
    zones: template.zones.map((z) => ({
      id: z.id,
      placement: "other",
      placementLabel: z.label,
      widthCm: z.widthCm,
      heightCm: z.heightCm,
      whiteLayers: 1,
      varnish: false,
      primer: false,
    })),
  };
}

/**
 * A ready-set UV line billed at the set price: every zone counts as part of
 * the item (the set price covers the prints), the item total is the set
 * total, no minimum; costs (item, ink) stay as calculated, profit follows.
 */
export function uvLineAtGiftSetPrice(data: UvLineData, totalMdl: number): UvLineData {
  const total = round2(totalMdl);
  return {
    ...data,
    zones: data.zones.map((z) => ({
      ...z,
      includedInItem: true,
      unitPrintPriceMdl: 0,
      unitWhiteSurchargeMdl: 0,
      unitVarnishSurchargeMdl: 0,
      ...(z.unitPrimerSurchargeMdl !== undefined ? { unitPrimerSurchargeMdl: 0 } : {}),
    })),
    pricing: {
      ...data.pricing,
      tierMinQty: null,
      itemPriceSource: null,
      unitItemPriceMdl: data.quantity > 0 ? round2(total / data.quantity) : total,
      itemSellTotalMdl: total,
      printSellTotalMdl: 0,
      whiteSurchargeTotalMdl: 0,
      varnishSurchargeTotalMdl: 0,
      ...(data.pricing.primerSurchargeTotalMdl !== undefined ? { primerSurchargeTotalMdl: 0 } : {}),
      setupFeeMdl: 0,
      minimumLineUpliftMdl: 0,
      totalSellPriceMdl: total,
      priceNotSet: undefined,
    },
    estimatedProfitMdl: round2(total - data.costs.totalCostMdl),
  };
}
