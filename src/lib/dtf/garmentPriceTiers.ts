import { z } from "zod";
import type { GarmentKind } from "@/lib/dtf/dtfConstants";

/** One run-size step: from `minQty` pieces the price per piece is `priceMdl`. */
export const garmentPriceTierSchema = z.object({
  minQty: z.number().int().min(1).max(100_000),
  priceMdl: z.number().min(0).max(1_000_000),
});
export type GarmentPriceTier = z.infer<typeof garmentPriceTierSchema>;

export const garmentPriceTiersSchema = z
  .array(garmentPriceTierSchema)
  .max(10)
  .refine((tiers) => new Set(tiers.map((t) => t.minQty)).size === tiers.length, {
    message: "dtf_tiers_duplicate_qty",
  })
  .refine((tiers) => tiers.length === 0 || tiers.some((t) => t.minQty === 1), {
    message: "dtf_tiers_need_single_piece",
  });

export function sortTiers(tiers: readonly GarmentPriceTier[]): GarmentPriceTier[] {
  return [...tiers].sort((a, b) => a.minQty - b.minQty);
}

/** Tolerant read of run-size tiers (`StockVariant.priceTiers`, DTF line snapshots). */
export function parseGarmentPriceTiers(raw: unknown): GarmentPriceTier[] {
  const parsed = garmentPriceTiersSchema.safeParse(raw);
  return parsed.success ? sortTiers(parsed.data) : [];
}

/** Price per piece for a run of `quantity`; null when the garment has no prices. */
export function tierPriceForQuantity(
  tiers: readonly GarmentPriceTier[],
  quantity: number,
): GarmentPriceTier | null {
  let match: GarmentPriceTier | null = null;
  for (const tier of sortTiers(tiers)) {
    if (tier.minQty <= quantity) match = tier;
  }
  return match;
}

function tiers(p1: number, p2: number, p10: number, p50: number): GarmentPriceTier[] {
  return [
    { minQty: 1, priceMdl: p1 },
    { minQty: 2, priceMdl: p2 },
    { minQty: 10, priceMdl: p10 },
    { minQty: 50, priceMdl: p50 },
  ];
}

/**
 * Default run-size prices of a new item. T-shirts are the bare item
 * (100 / 95 / 85 / 70): with an A4 at the run-discounted list price they give
 * the studio «Ofertă» 280 / 260 / 240 / 200. Caps and socks are sold as a set
 * with a logo (see `dtfIncludedPrintFor`), at the «Ofertă» prices. Other items
 * are priced by the operator.
 */
export function defaultPriceTiers(kind: GarmentKind): GarmentPriceTier[] {
  switch (kind) {
    case "tshirt":
      return tiers(100, 95, 85, 70);
    case "socks":
      return tiers(70, 55, 45, 40);
    case "cap":
      return tiers(180, 150, 118, 100);
    case "polo":
    case "hoodie":
    case "bodysuit":
    case "bag":
    case "underwear":
    case "other":
      return [];
  }
}
