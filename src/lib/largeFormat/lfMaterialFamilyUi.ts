/**
 * UI helpers for material family display and selection.
 *
 * Groups materials by family key and identifies families that should be
 * presented as a single option (min-sufficient billing) vs. individual rolls.
 */

import { lfMaterialFamilyKey } from "./lfMaterialFamily";

export interface MaterialForFamilyGrouping {
  id: string;
  name: string;
  rollWidthMeters: number | string;
  [key: string]: unknown;
}

/**
 * Material families that use min-sufficient billing: client selects the family,
 * not the specific roll. Extend this list as more families adopt the policy.
 */
const FAMILY_BILLING_FAMILIES = new Set(["ORACAL MATT"]);

/**
 * Checks if a family key should use family-based billing (single UI option).
 */
export function usesFamilyBilling(familyKey: string): boolean {
  return FAMILY_BILLING_FAMILIES.has(familyKey);
}

/**
 * Represents either a single material or a grouped family for UI display.
 */
export type MaterialOrFamily =
  | {
      type: "single";
      material: MaterialForFamilyGrouping;
    }
  | {
      type: "family";
      familyKey: string;
      /** Display name (family key without roll size). */
      displayName: string;
      /** All rolls in this family, sorted by width. */
      members: MaterialForFamilyGrouping[];
      /** Representative member for price display (narrowest roll). */
      representative: MaterialForFamilyGrouping;
    };

/**
 * Groups materials by family. Families in `FAMILY_BILLING_FAMILIES` are
 * collapsed into a single "family" entry; all other families (including
 * single-member families) are returned as individual "single" entries.
 *
 * @param materials Active large-format materials (already filtered for `isActive: true`)
 * @returns Array of material-or-family entries for UI rendering
 */
export function groupMaterialsForUi<T extends MaterialForFamilyGrouping>(
  materials: readonly T[],
): MaterialOrFamily[] {
  // Group by family key.
  const familyMap = new Map<string, T[]>();
  for (const m of materials) {
    const fk = lfMaterialFamilyKey(m.name);
    const existing = familyMap.get(fk);
    if (existing) {
      existing.push(m);
    } else {
      familyMap.set(fk, [m]);
    }
  }

  const result: MaterialOrFamily[] = [];

  for (const [familyKey, members] of familyMap) {
    // Sort members by roll width (narrowest first).
    const sorted = [...members].sort((a, b) => {
      const wa = typeof a.rollWidthMeters === "string" ? parseFloat(a.rollWidthMeters) : a.rollWidthMeters;
      const wb = typeof b.rollWidthMeters === "string" ? parseFloat(b.rollWidthMeters) : b.rollWidthMeters;
      return wa - wb;
    });

    if (usesFamilyBilling(familyKey)) {
      // Collapse family into a single entry.
      result.push({
        type: "family",
        familyKey,
        displayName: familyKey,
        members: sorted,
        representative: sorted[0]!,
      });
    } else {
      // Treat each roll as an individual entry.
      for (const m of sorted) {
        result.push({ type: "single", material: m });
      }
    }
  }

  return result;
}

/**
 * Extracts the selection value (materialId or familyKey) from a MaterialOrFamily.
 */
export function selectionValueFromMaterialOrFamily(item: MaterialOrFamily): string {
  if (item.type === "family") {
    return `family:${item.familyKey}`;
  }
  return `material:${item.material.id}`;
}

/**
 * Parses a selection value back into either a materialId or a familyKey.
 */
export function parseSelectionValue(value: string | null): {
  type: "material" | "family" | null;
  id: string | null;
} {
  if (!value) return { type: null, id: null };
  if (value.startsWith("family:")) {
    return { type: "family", id: value.slice("family:".length) };
  }
  if (value.startsWith("material:")) {
    return { type: "material", id: value.slice("material:".length) };
  }
  // Legacy: assume bare value is a material ID (backward compat).
  return { type: "material", id: value };
}
