import type { Prisma } from "@prisma/client";
import { correctReceiptCost, receive, reverseReceipt, revalueAverageCost } from "@/lib/stock/unified/ledger";
import { computeImportCosting, weightedUnitCost } from "./landedCost";
import { importLabel } from "./importQueries";
import type { ImportPostingMode } from "./constants";

type Tx = Prisma.TransactionClient;

/** Thrown with a stable code the API maps to 400/409. */
export class ImportPostError extends Error {
  constructor(public readonly code: string, public readonly extra: Record<string, unknown> = {}) {
    super(code);
    this.name = "ImportPostError";
  }
}

const num = (d: { toString(): string } | null | undefined): number => (d == null ? 0 : Number(d.toString()));

/**
 * Post (or re-post after a cost change) an import.
 *
 * - «normal»: each stock line becomes a receipt at its landed cost; posting
 *   again re-prices those receipts (e.g. the customs declaration replaced the
 *   advance) through `correctReceiptCost`.
 * - «historical»: goods are already on the shelf (counted by a stocktake), so
 *   no receipt — each variant's average cost is set to its quantity-weighted
 *   landed cost across all historical imports.
 *
 * The mode is fixed by the first posting.
 */
export async function postImport(
  tx: Tx,
  params: { importId: string; mode: ImportPostingMode; userId: string | null; costsIncludeVat: boolean },
): Promise<void> {
  const s = await tx.importShipment.findUnique({
    where: { id: params.importId },
    include: { lines: { orderBy: { position: "asc" } }, costs: true },
  });
  if (!s) throw new ImportPostError("import_not_found");
  if (s.postedMode && s.postedMode !== params.mode) throw new ImportPostError("import_mode_locked", { mode: s.postedMode });
  if (s.lines.length === 0) throw new ImportPostError("import_no_lines");
  const unmatched = s.lines.filter((l) => !l.skip && !l.variantId);
  if (unmatched.length > 0) {
    throw new ImportPostError("import_lines_unmatched", { codes: unmatched.map((l) => l.supplierCode) });
  }
  const costing = computeImportCosting(
    s.lines.map((l) => ({ id: l.id, quantity: num(l.quantity), amount: num(l.amount) })),
    s.costs.map((c) => ({ kind: c.kind, amountMdl: num(c.amountMdl), excluded: c.excluded, isProvisional: c.isProvisional })),
  );
  if (!(costing.totalCostsMdl > 0)) throw new ImportPostError("import_no_costs");
  const byLine = new Map(costing.lines.map((c) => [c.id, c]));
  const note = `Импорт ${importLabel(s)}`;
  const purchasedAt: Date = s.arrivedAt ?? s.orderedAt ?? new Date();

  if (params.mode === "normal") {
    for (const line of s.lines) {
      const c = byLine.get(line.id)!;
      if (line.skip || !line.variantId) {
        if (line.receiptId) throw new ImportPostError("import_line_skip_after_post", { code: line.supplierCode });
        continue;
      }
      if (line.receiptId) {
        await correctReceiptCost(tx, {
          receiptId: line.receiptId,
          newTotalCostMdl: c.landedTotalMdl,
          isProvisional: costing.provisional,
          createdById: params.userId,
        });
      } else {
        const { receiptId } = await receive(tx, {
          variantId: line.variantId,
          quantity: num(line.quantity),
          totalCostMdl: c.landedTotalMdl,
          purchasedAt,
          supplierName: s.supplierName,
          note,
          isProvisional: costing.provisional,
          amountsIncludeVat: params.costsIncludeVat,
          createdById: params.userId,
        });
        await tx.importLine.update({ where: { id: line.id }, data: { receiptId } });
      }
      await tx.importLine.update({ where: { id: line.id }, data: { postedUnitCostMdl: c.landedUnitMdl } });
    }
  } else {
    const variantIds = new Set<string>();
    for (const line of s.lines) {
      const c = byLine.get(line.id)!;
      await tx.importLine.update({
        where: { id: line.id },
        data: { postedUnitCostMdl: line.skip || !line.variantId ? null : c.landedUnitMdl },
      });
      if (!line.skip && line.variantId) variantIds.add(line.variantId);
    }
    // Mark posted first so this import's lines count in the weighted cost.
    await tx.importShipment.update({ where: { id: s.id }, data: { postedMode: "historical" } });
    for (const variantId of variantIds) {
      const entries = await tx.importLine.findMany({
        where: { variantId, skip: false, postedUnitCostMdl: { not: null }, shipment: { postedMode: "historical" } },
        select: { quantity: true, postedUnitCostMdl: true },
      });
      const unit = weightedUnitCost(entries.map((e) => ({ quantity: num(e.quantity), unitCostMdl: num(e.postedUnitCostMdl) })));
      if (unit != null) {
        await revalueAverageCost(tx, { variantId, unitCostMdl: unit, note, createdById: params.userId });
      }
    }
  }

  await tx.importShipment.update({
    where: { id: s.id },
    data: { status: "posted", postedMode: params.mode, postedAt: new Date(), postedById: params.userId },
  });
}

/**
 * Undo a «normal» posting: take every receipt back (refused when some units
 * were already used — fix with a stocktake instead). Historical postings only
 * set costs and cannot be undone automatically.
 */
export async function unpostImport(tx: Tx, params: { importId: string; userId: string | null }): Promise<void> {
  const s = await tx.importShipment.findUnique({ where: { id: params.importId }, include: { lines: true } });
  if (!s) throw new ImportPostError("import_not_found");
  if (s.postedMode !== "normal") throw new ImportPostError("import_unpost_only_normal");
  for (const line of s.lines) {
    if (!line.receiptId) continue;
    const receiptId: string = line.receiptId;
    await tx.importLine.update({ where: { id: line.id }, data: { receiptId: null, postedUnitCostMdl: null } });
    await reverseReceipt(tx, { receiptId, createdById: params.userId });
  }
  await tx.importShipment.update({
    where: { id: s.id },
    data: { status: "received", postedMode: null, postedAt: null, postedById: null },
  });
}
