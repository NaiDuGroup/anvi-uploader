/**
 * Material family billing: pick the minimally sufficient roll for pricing.
 *
 * For materials grouped by family (e.g. "ORACAL MATT" across 1.05/1.27/1.62),
 * the client sees only the family name and receives a firm price based on the
 * narrowest roll whose printable width can fit the artwork. Workshop may later
 * print on a cheaper/wider roll; billing stays locked on the min-sufficient roll.
 */

import type { Prisma } from "@prisma/client";
import { lfMaterialFamilyKey } from "./lfMaterialFamily";
import { computeLargeFormatRollLayout } from "./largeFormatRollPack";
import { resolveEffectivePrintableWidthMeters } from "./largeFormatRollConstants";

export interface LfFamilyRollCandidate {
  id: string;
  name: string;
  rollWidthMeters: string;
  printableWidthMeters: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PickBillingRollInput {
  /**
   * All active rolls in the material family (same family key), ordered by
   * roll width ascending (narrowest first) for deterministic min-roll selection.
   */
  familyRolls: readonly LfFamilyRollCandidate[];
  /** Print dimensions (cm) after gallery-wrap inflation if applicable. */
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
}

export interface PickBillingRollResult {
  /**
   * The narrowest roll that can fit the artwork, or null if none fit.
   * When multiple rolls have the same width, the one with lower `sortOrder` wins.
   */
  billingRoll: LfFamilyRollCandidate | null;
  /** All rolls that fit the layout (for workshop choice later). */
  fittingRolls: LfFamilyRollCandidate[];
  /** Rolls that were too narrow to fit. */
  tooNarrowRolls: LfFamilyRollCandidate[];
}

/**
 * Pick the billing roll: the minimally sufficient roll for the artwork.
 *
 * Algorithm:
 * 1. For each roll in ascending width order, compute layout via `computeLargeFormatRollLayout`
 * 2. Collect rolls that fit (`ok: true`)
 * 3. Return the first (narrowest) fitting roll as the billing roll
 *
 * When no rolls fit, returns `billingRoll: null` (caller should reject with "does not fit").
 */
export function pickBillingRoll(input: PickBillingRollInput): PickBillingRollResult {
  const { familyRolls, printWidthCm, printHeightCm, quantity } = input;

  const fittingRolls: LfFamilyRollCandidate[] = [];
  const tooNarrowRolls: LfFamilyRollCandidate[] = [];

  for (const roll of familyRolls) {
    const printableM = resolveEffectivePrintableWidthMeters({
      printableWidthMeters: roll.printableWidthMeters,
      rollWidthMeters: roll.rollWidthMeters,
    });
    const printableCm = printableM * 100;

    const pack = computeLargeFormatRollLayout({
      printableWidthCm: printableCm,
      nominalRollWidthMeters: Number(roll.rollWidthMeters),
      printWidthCm,
      printHeightCm,
      quantity,
    });

    if (pack.ok) {
      fittingRolls.push(roll);
    } else {
      tooNarrowRolls.push(roll);
    }
  }

  // The billing roll is the first (narrowest) roll that fits.
  const billingRoll = fittingRolls.length > 0 ? fittingRolls[0]! : null;

  return { billingRoll, fittingRolls, tooNarrowRolls };
}

/**
 * Fetch all active rolls for a given material family, sorted by width ascending.
 * Used by the billing-roll picker and workshop layout planner.
 */
export async function fetchFamilyRolls(
  prisma: Prisma.TransactionClient | { largeFormatMaterial: { findMany: Function } },
  familyKey: string,
): Promise<LfFamilyRollCandidate[]> {
  const materials = await prisma.largeFormatMaterial.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      rollWidthMeters: true,
      printableWidthMeters: true,
      isActive: true,
      sortOrder: true,
    },
    orderBy: [{ rollWidthMeters: "asc" }, { sortOrder: "asc" }],
  });

  // Filter to the family, then sort by width + sortOrder.
  return materials
    .filter((m: { name: string }) => lfMaterialFamilyKey(m.name) === familyKey)
    .map((m: { rollWidthMeters: { toString(): string }; printableWidthMeters?: { toString(): string } | null; [key: string]: any }) => ({
      ...m,
      rollWidthMeters: m.rollWidthMeters.toString(),
      printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
    }));
}
