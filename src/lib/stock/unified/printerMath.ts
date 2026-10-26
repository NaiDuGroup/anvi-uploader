import { roundQty } from "./ledgerMath";

/**
 * Pure helpers for printer consumption: how a printer's total use is spread
 * across its slots, and what one unit of it costs.
 */

/** `Printer.code` of the studio printers seeded by the printers migrations. */
export enum PrinterCode {
  LargeFormat = "lf",
  Uv = "uv",
  Dtf = "dtf",
  Ricoh = "ricoh",
  /** Epson L1800 with sublimation inks (mugs, pillows, puzzles, keychains, clocks). */
  Sublimation = "subl",
}

/** `PrinterSlot.role`. */
export enum PrinterSlotRole {
  Ink = "ink",
  Toner = "toner",
  Film = "film",
  Powder = "powder",
  /** Sublimation transfer paper, counted in sheets. */
  Paper = "paper",
  /** Heat-resistant tape holding the transfer, counted in metres. */
  Tape = "tape",
}

export type SlotForSplit = {
  variantId: string | null;
  share: number | null;
};

export type SlotQuantity = { variantId: string; quantity: number };

/**
 * Spread `total` across ink slots by their shares (normalised, so shares need not
 * add up to 1). Slots without a loaded variant or with no share are skipped;
 * when no slot has a share, the total is split evenly across loaded slots.
 */
export function splitByShares(total: number, slots: readonly SlotForSplit[]): SlotQuantity[] {
  if (!(total > 0)) return [];
  const loaded = slots.filter((s): s is { variantId: string; share: number | null } => s.variantId != null);
  if (loaded.length === 0) return [];
  const withShare = loaded.filter((s) => s.share != null && s.share > 0);
  const basis = withShare.length > 0 ? withShare : loaded.map((s) => ({ ...s, share: 1 }));
  const shareSum: number = basis.reduce((acc, s) => acc + (s.share ?? 0), 0);
  return basis
    .map((s) => ({ variantId: s.variantId, quantity: roundQty((total * (s.share ?? 0)) / shareSum) }))
    .filter((q) => q.quantity > 0);
}

/** Part of an ink use that must come from particular slots (matched by `PrinterSlot.label`). */
export type InkPart = { labels: readonly string[]; amount: number };

export type LabeledInkSlot = SlotForSplit & { label: string };

/**
 * Spread each part over the ink slots whose label matches one of its labels
 * (case-insensitive), by their shares (see {@link splitByShares}). A part with
 * no matching loaded slot takes nothing.
 */
export function splitInkPartsBySlot(parts: readonly InkPart[], slots: readonly LabeledInkSlot[]): SlotQuantity[] {
  return parts.flatMap((part) => {
    const wanted = new Set<string>(part.labels.map((l) => l.trim().toLowerCase()));
    return splitByShares(
      part.amount,
      slots.filter((s) => wanted.has(s.label.trim().toLowerCase())),
    );
  });
}

export type TonerSlot = { variantId: string | null; sheetsPerUnit: number | null };

/** Cartridges used for `sheets` printed sheets, per toner slot. Slots without a yield are skipped. */
export function tonerForSheets(sheets: number, slots: readonly TonerSlot[]): SlotQuantity[] {
  if (!(sheets > 0)) return [];
  return slots
    .filter((s): s is { variantId: string; sheetsPerUnit: number } =>
      s.variantId != null && s.sheetsPerUnit != null && s.sheetsPerUnit > 0,
    )
    .map((s) => ({ variantId: s.variantId, quantity: roundQty(sheets / s.sheetsPerUnit) }))
    .filter((q) => q.quantity > 0);
}

export type CostedSlot = {
  share: number | null;
  /** Effective unit cost of the loaded variant (avg ?? hint); null when unknown or no variant. */
  unitCost: number | null;
};

/**
 * Blended cost of one unit of the printer's ink (MDL/ml): share-weighted average
 * over slots whose cost is known. Null when no slot has a cost yet.
 */
export function blendedInkCost(slots: readonly CostedSlot[]): number | null {
  const known = slots.filter((s): s is { share: number | null; unitCost: number } => s.unitCost != null);
  if (known.length === 0) return null;
  const weights: number[] = known.map((s) => (s.share != null && s.share > 0 ? s.share : 0));
  const weightSum: number = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    return known.reduce((acc, s) => acc + s.unitCost, 0) / known.length;
  }
  return known.reduce((acc, s, i) => acc + s.unitCost * weights[i]!, 0) / weightSum;
}

/** Toner cost of one printed sheet (MDL): Σ cartridge cost / yield over slots with both known. */
export function tonerCostPerSheet(
  slots: readonly { unitCost: number | null; sheetsPerUnit: number | null }[],
): number | null {
  const known = slots.filter(
    (s): s is { unitCost: number; sheetsPerUnit: number } =>
      s.unitCost != null && s.sheetsPerUnit != null && s.sheetsPerUnit > 0,
  );
  if (known.length === 0) return null;
  return known.reduce((acc, s) => acc + s.unitCost / s.sheetsPerUnit, 0);
}
