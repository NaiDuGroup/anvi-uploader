/**
 * Client-side helper to resolve the billing material for family-based pricing.
 * Used in order creation UIs to display which roll width was used for pricing.
 */

import type { PublicLargeFormatMaterial } from "@/lib/swr";
import { lfMaterialFamilyKey } from "./lfMaterialFamily";
import { pickBillingRoll, type LfFamilyRollCandidate } from "./lfFamilyBilling";
import { resolveGalleryWrapCm } from "./lfLayoutBorder";
import { resolveEffectivePrintableWidthMeters } from "./largeFormatRollConstants";
import {
  packGroupTiles,
  GROUP_TILE_PACK_DEFAULT_GAP_CM,
} from "./groupTilePack";

export interface ResolveFamilyPreviewInput {
  /** Selection value: either `material:<id>` or `family:<key>` */
  selectionValue: string | null;
  /** All available materials */
  materials: readonly PublicLargeFormatMaterial[];
  /** Print dimensions in cm */
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
}

export interface ResolveFamilyPreviewResult {
  /** Whether the selection is a family */
  isFamily: boolean;
  /** The billing material (for families, the min-sufficient roll; for concrete materials, the selected material) */
  billingMaterial: PublicLargeFormatMaterial | null;
  /** For families, the width of the billing roll in meters (for display) */
  billingRollWidthMeters: number | null;
}

/**
 * Resolve which material is used for billing/pricing preview.
 * - For concrete material selection: returns that material
 * - For family selection: uses pickBillingRoll to determine the min-sufficient roll
 */
export function resolveFamilyPreviewMaterial(
  input: ResolveFamilyPreviewInput,
): ResolveFamilyPreviewResult {
  const { selectionValue, materials, printWidthCm, printHeightCm, quantity } = input;

  if (!selectionValue) {
    return { isFamily: false, billingMaterial: null, billingRollWidthMeters: null };
  }

  // Parse selection value
  const [type, id] = selectionValue.split(":");
  if (!type || !id) {
    return { isFamily: false, billingMaterial: null, billingRollWidthMeters: null };
  }

  // Concrete material selection
  if (type === "material") {
    const material = materials.find((m) => m.id === id) ?? null;
    return { isFamily: false, billingMaterial: material, billingRollWidthMeters: null };
  }

  // Family selection
  if (type === "family") {
    const familyKey = id;
    const familyMaterials = materials.filter((m) => lfMaterialFamilyKey(m.name) === familyKey);

    if (familyMaterials.length === 0) {
      return { isFamily: true, billingMaterial: null, billingRollWidthMeters: null };
    }

    // Sort by width ascending (narrowest first) for stable fallback ordering.
    const sortedFamily = [...familyMaterials].sort((a, b) => {
      const widthA = Number(a.rollWidthMeters);
      const widthB = Number(b.rollWidthMeters);
      return widthA - widthB;
    });

    // Cheapest-by-total-sell selection (mirrors server-side
    // `pickCheapestFamilyRollForTiles`). Public API pre-resolves sell rate
    // per customer type into `sellPricePerLinearMeter`, so no customerType
    // parameter is needed here.
    const hasSellRates = sortedFamily.every(
      (m) =>
        typeof m.sellPricePerLinearMeter === "number" &&
        Number.isFinite(m.sellPricePerLinearMeter) &&
        m.sellPricePerLinearMeter >= 0,
    );

    if (hasSellRates) {
      const wrap = resolveGalleryWrapCm(sortedFamily[0]!.name);
      const effW = printWidthCm + 2 * wrap;
      const effH = printHeightCm + 2 * wrap;
      let best: { mat: PublicLargeFormatMaterial; sellTotal: number } | null = null;
      for (const cand of sortedFamily) {
        const printableM = resolveEffectivePrintableWidthMeters({
          printableWidthMeters:
            cand.printableWidthMeters != null
              ? String(cand.printableWidthMeters)
              : null,
          rollWidthMeters: String(cand.rollWidthMeters),
        });
        const printableCm = printableM * 100;
        const tiles = Array.from({ length: quantity }, (_, i) => ({
          id: `T${i + 1}`,
          label: `Copy ${i + 1}`,
          widthCm: effW,
          heightCm: effH,
          allowRotate: true,
        }));
        const pack = packGroupTiles(
          tiles,
          printableCm,
          GROUP_TILE_PACK_DEFAULT_GAP_CM,
        );
        if (pack.unplacedTileIds.length > 0) continue;
        const lm = pack.totalAlongCm / 100;
        const sellTotal = lm * cand.sellPricePerLinearMeter;
        if (!best || sellTotal < best.sellTotal) {
          best = { mat: cand, sellTotal };
        }
      }
      if (best) {
        return {
          isFamily: true,
          billingMaterial: best.mat,
          billingRollWidthMeters: Number(best.mat.rollWidthMeters),
        };
      }
      // No roll fits — return "not fits" state below via fallback path.
    }

    // Fallback: legacy narrowest-sufficient path.
    const familyRolls: LfFamilyRollCandidate[] = sortedFamily.map((m, idx) => ({
      id: m.id,
      name: m.name,
      rollWidthMeters: m.rollWidthMeters.toString(),
      printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
      isActive: true,
      sortOrder: idx,
    }));

    const result = pickBillingRoll({
      familyRolls,
      printWidthCm,
      printHeightCm,
      quantity,
    });

    if (result.billingRoll) {
      const billingMaterial = familyMaterials.find((m) => m.id === result.billingRoll!.id) ?? null;
      return {
        isFamily: true,
        billingMaterial,
        billingRollWidthMeters: Number(result.billingRoll.rollWidthMeters),
      };
    }

    return { isFamily: true, billingMaterial: null, billingRollWidthMeters: null };
  }

  return { isFamily: false, billingMaterial: null, billingRollWidthMeters: null };
}
