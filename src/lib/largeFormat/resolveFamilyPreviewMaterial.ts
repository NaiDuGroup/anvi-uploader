/**
 * Client-side helper to resolve the billing material for family-based pricing.
 * Used in order creation UIs to display which roll width was used for pricing.
 */

import type { PublicLargeFormatMaterial } from "@/lib/swr";
import { lfMaterialFamilyKey } from "./lfMaterialFamily";
import { pickBillingRoll, type LfFamilyRollCandidate } from "./lfFamilyBilling";

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

    // Sort by width ascending (narrowest first) for consistent billing roll selection
    const sortedFamily = [...familyMaterials].sort((a, b) => {
      const widthA = Number(a.rollWidthMeters);
      const widthB = Number(b.rollWidthMeters);
      return widthA - widthB;
    });

    // Convert to LfFamilyRollCandidate format
    const familyRolls: LfFamilyRollCandidate[] = sortedFamily.map((m, idx) => ({
      id: m.id,
      name: m.name,
      rollWidthMeters: m.rollWidthMeters.toString(),
      printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
      isActive: true, // Public API only returns active materials
      sortOrder: idx, // Use index as sort order after width sorting
    }));

    // Use pickBillingRoll to determine the billing material
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

    // No roll fits
    return { isFamily: true, billingMaterial: null, billingRollWidthMeters: null };
  }

  return { isFamily: false, billingMaterial: null, billingRollWidthMeters: null };
}
