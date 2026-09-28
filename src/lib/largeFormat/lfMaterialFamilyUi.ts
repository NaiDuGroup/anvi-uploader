/**
 * UI helpers for material family display and selection.
 *
 * Groups materials by family key and identifies families that should be
 * presented as a single option (min-sufficient billing) vs. individual rolls.
 */

import { lfMaterialFamilyKey } from "./lfMaterialFamily";
import {
  pickBillingRoll,
  type LfFamilyRollCandidate,
} from "./lfFamilyBilling";
import { resolveGalleryWrapCm } from "./lfLayoutBorder";

export interface MaterialForFamilyGrouping {
  id: string;
  name: string;
  rollWidthMeters: number | string;
  printableWidthMeters?: number | string | null;
  sortOrder?: number;
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

function rollWidthNum(m: MaterialForFamilyGrouping): number {
  return typeof m.rollWidthMeters === "string"
    ? parseFloat(m.rollWidthMeters)
    : Number(m.rollWidthMeters);
}

/** Prefer catalog rows with an explicit printable width (prod copies over seed nulls). */
function hasExplicitPrintable(m: MaterialForFamilyGrouping): boolean {
  const v = m.printableWidthMeters;
  if (v == null) return false;
  const s = String(v).trim();
  if (s === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

/**
 * Sort family members: narrowest roll first; at equal width prefer explicit
 * printableWidthMeters (prod rows) over seed nulls; then sortOrder.
 */
export function sortFamilyMembersForBilling<T extends MaterialForFamilyGrouping>(
  members: readonly T[],
): T[] {
  return [...members].sort((a, b) => {
    const wa = rollWidthNum(a);
    const wb = rollWidthNum(b);
    if (wa !== wb) return wa - wb;
    const pa = hasExplicitPrintable(a) ? 0 : 1;
    const pb = hasExplicitPrintable(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

function toRollCandidate(m: MaterialForFamilyGrouping): LfFamilyRollCandidate {
  return {
    id: m.id,
    name: m.name,
    rollWidthMeters: String(m.rollWidthMeters),
    printableWidthMeters:
      m.printableWidthMeters == null || String(m.printableWidthMeters).trim() === ""
        ? null
        : String(m.printableWidthMeters),
    isActive: true,
    sortOrder: m.sortOrder ?? 0,
  };
}

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
    const sorted = sortFamilyMembersForBilling(members);

    if (usesFamilyBilling(familyKey)) {
      result.push({
        type: "family",
        familyKey,
        displayName: familyKey,
        members: sorted,
        representative: sorted[0]!,
      });
    } else {
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

export interface ResolveFamilyPreviewMaterialInput<T extends MaterialForFamilyGrouping> {
  /** `family:<key>` or `material:<id>` (or bare material id). */
  selectionValue: string | null;
  /** Full active catalog (family members resolved from this list). */
  materials: readonly T[];
  /** Face print width (cm). When invalid/missing, returns family representative. */
  printWidthCm?: number | null;
  printHeightCm?: number | null;
  quantity?: number | null;
}

/**
 * Resolve the concrete material used for layout preview / client-side price
 * when the UI selection is a family. Mirrors server `pickBillingRoll`:
 * min-sufficient (narrowest fitting) roll, not cheapest.
 *
 * - Family + valid dims → billing roll from pickBillingRoll (gallery-wrap applied)
 * - Family + no/invalid dims → narrowest representative (printable preferred)
 * - Concrete material → that material
 * - Nothing fits → null (caller shows "does not fit")
 */
export function resolveFamilyPreviewMaterial<T extends MaterialForFamilyGrouping>(
  input: ResolveFamilyPreviewMaterialInput<T>,
): T | null {
  const sel = parseSelectionValue(input.selectionValue);
  if (!sel.type || !sel.id) return null;

  if (sel.type === "material") {
    return input.materials.find((m) => m.id === sel.id) ?? null;
  }

  const members = sortFamilyMembersForBilling(
    input.materials.filter((m) => lfMaterialFamilyKey(m.name) === sel.id),
  );
  if (members.length === 0) return null;

  const w = input.printWidthCm;
  const h = input.printHeightCm;
  const q = input.quantity ?? 1;
  const dimsOk =
    w != null &&
    h != null &&
    Number.isFinite(w) &&
    w > 0 &&
    Number.isFinite(h) &&
    h > 0 &&
    Number.isFinite(q) &&
    q >= 1;

  if (!dimsOk) {
    return members[0]!;
  }

  const wrap = resolveGalleryWrapCm(members[0]!.name);
  const { billingRoll } = pickBillingRoll({
    familyRolls: members.map(toRollCandidate),
    printWidthCm: w! + 2 * wrap,
    printHeightCm: h! + 2 * wrap,
    quantity: q,
  });

  if (!billingRoll) return null;
  return members.find((m) => m.id === billingRoll.id) ?? null;
}
