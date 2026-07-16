import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EFACTURA_STATUS, ISSUED_EFACTURA_STATUSES } from "@/lib/efactura/types";
import {
  AUTO_APPLY_THRESHOLD,
  extractInvoiceRefs,
  scoreMatch,
  type MatchSignals,
} from "./match";
import { excludeNonDeliveryWhere } from "./fiscalFlags";
import { markOperationalCreditsIgnored } from "./operational";

type Db = typeof prisma | Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

/**
 * e-Factura statuses that represent a live receivable (money owed to us).
 * Excludes archive (historical), draft, rejected and cancelled.
 */
export const RECEIVABLE_EFACTURA_STATUSES = [
  EFACTURA_STATUS.SIGNED_SUPPLIER,
  EFACTURA_STATUS.ACCEPTED_BUYER,
  EFACTURA_STATUS.SENT_TO_BUYER,
  EFACTURA_STATUS.SIGNED_BUYER,
  EFACTURA_STATUS.TRANSPORTED,
];

/**
 * Issued pool for reconciliation acts: sent / completed / archive are one
 * bucket. Draft, rejected and cancelled are excluded. Used by the client
 * statement so historical debits are not omitted while their payments are
 * counted (which would fake a huge overpayment).
 */
export const STATEMENT_EFACTURA_STATUSES = [...ISSUED_EFACTURA_STATUSES];

function buyerLabel(name: string | null): string {
  return name?.trim() || "—";
}

interface FiscalCandidate {
  id: string;
  seria: string;
  number: string;
  totalAmount: Prisma.Decimal | null;
  remaining: Prisma.Decimal | null;
  buyerIdno: string | null;
  buyerName: string | null;
  clientId: string | null;
  numberMatched: boolean;
}

export interface MatchSuggestion {
  fiscalInvoiceId: string;
  fiscalNumber: string;
  buyerName: string;
  amount: string;
  confidence: number;
  signals: MatchSignals;
}

interface TxForMatch {
  id: string;
  direction: string;
  amount: Prisma.Decimal;
  counterpartyIdno: string | null;
  purpose: string | null;
}

/** Sums existing allocations per fiscal invoice id. */
async function allocatedByFiscal(
  db: Db,
  ids: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const map = new Map<string, Prisma.Decimal>();
  if (ids.length === 0) return map;
  const grouped = await db.paymentAllocation.groupBy({
    by: ["fiscalInvoiceId"],
    where: { fiscalInvoiceId: { in: ids } },
    _sum: { amount: true },
  });
  for (const g of grouped) {
    if (g.fiscalInvoiceId) map.set(g.fiscalInvoiceId, g._sum.amount ?? ZERO);
  }
  return map;
}

/**
 * Ranks candidate fiscal invoices for a credit transaction. Returns
 * suggestions sorted by descending confidence.
 */
export async function computeSuggestions(
  db: Db,
  tx: TxForMatch,
): Promise<MatchSuggestion[]> {
  if (tx.direction !== "CREDIT") return [];

  const refs = extractInvoiceRefs(tx.purpose);
  const numberMatchedIds = new Set<string>();

  const where: Prisma.FiscalInvoiceWhereInput[] = [];

  // By fiscal token cited in the purpose (strongest signal).
  if (refs.fiscalTokens.length > 0) {
    where.push({
      OR: refs.fiscalTokens.flatMap((tok) => {
        const m = tok.match(/^([A-Z]+)(\d+)$/);
        if (!m) return [{ number: tok }];
        return [{ number: m[2] }, { AND: [{ seria: m[1] }, { number: m[2] }] }];
      }),
    });
  }

  // By payer fiscal code -> buyer IDNO.
  if (tx.counterpartyIdno) {
    where.push({ buyerIdno: tx.counterpartyIdno });
  }

  if (where.length === 0) return [];

  // Include Archive (6): payments often arrive after the invoice is archived
  // on the SFS portal, and the purpose still cites the fiscal number.
  const fiscalInvoices = await db.fiscalInvoice.findMany({
    where: {
      eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
      paidAt: null,
      OR: where,
      AND: [excludeNonDeliveryWhere()],
    },
    select: {
      id: true,
      seria: true,
      number: true,
      totalAmount: true,
      buyerIdno: true,
      buyerName: true,
      clientId: true,
    },
  });

  if (fiscalInvoices.length === 0) return [];

  // Which fiscal invoices were cited by a token in the purpose?
  const tokenSet = new Set(refs.fiscalTokens);
  for (const fi of fiscalInvoices) {
    if (
      tokenSet.has(`${fi.seria}${fi.number}`) ||
      tokenSet.has(fi.number) ||
      [...tokenSet].some((t) => t.endsWith(fi.number) && t.startsWith(fi.seria))
    ) {
      numberMatchedIds.add(fi.id);
    }
  }

  const remaining = await allocatedByFiscal(
    db,
    fiscalInvoices.map((f) => f.id),
  );

  // Count open receivables per buyer IDNO (uniqueness signal).
  const openByBuyer = new Map<string, number>();
  const candidates: FiscalCandidate[] = [];
  for (const fi of fiscalInvoices) {
    const rem =
      fi.totalAmount != null
        ? fi.totalAmount.minus(remaining.get(fi.id) ?? ZERO)
        : null;
    if (rem != null && rem.lessThanOrEqualTo(0)) continue;
    if (fi.buyerIdno) {
      openByBuyer.set(fi.buyerIdno, (openByBuyer.get(fi.buyerIdno) ?? 0) + 1);
    }
    candidates.push({
      id: fi.id,
      seria: fi.seria,
      number: fi.number,
      totalAmount: fi.totalAmount,
      remaining: rem,
      buyerIdno: fi.buyerIdno,
      buyerName: fi.buyerName,
      clientId: fi.clientId,
      numberMatched: numberMatchedIds.has(fi.id),
    });
  }

  const suggestions: MatchSuggestion[] = candidates.map((c) => {
    const amountExact =
      c.totalAmount != null &&
      (c.totalAmount.equals(tx.amount) ||
        (c.remaining != null && c.remaining.equals(tx.amount)));
    const idnoMatch =
      !!tx.counterpartyIdno && c.buyerIdno === tx.counterpartyIdno;
    const signals: MatchSignals = {
      numberMatch: c.numberMatched,
      idnoMatch,
      amountExact,
      uniqueOpenForClient:
        !!c.buyerIdno && (openByBuyer.get(c.buyerIdno) ?? 0) === 1,
    };
    const confidence = scoreMatch(signals);
    const allocate =
      c.remaining != null ? Prisma.Decimal.min(tx.amount, c.remaining) : tx.amount;
    return {
      fiscalInvoiceId: c.id,
      fiscalNumber: `${c.seria}${c.number}`,
      buyerName: buyerLabel(c.buyerName),
      amount: allocate.toFixed(2),
      confidence,
      signals,
    };
  });

  return suggestions
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Applies an allocation against a fiscal invoice, flips it to paid once fully
 * covered, and mirrors the coverage onto the linked Cont spre plata invoice.
 */
export async function applyAllocation(
  db: Db,
  params: {
    bankTransactionId: string;
    fiscalInvoiceId: string;
    amount: string;
    matchedBy: "AUTO" | "MANUAL";
    confidence?: number | null;
    matchedById?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const fiscal = await db.fiscalInvoice.findUnique({
    where: { id: params.fiscalInvoiceId },
    select: { id: true, totalAmount: true, paidAt: true },
  });
  if (!fiscal) return;

  await db.paymentAllocation.upsert({
    where: {
      bankTransactionId_fiscalInvoiceId: {
        bankTransactionId: params.bankTransactionId,
        fiscalInvoiceId: params.fiscalInvoiceId,
      },
    },
    create: {
      bankTransactionId: params.bankTransactionId,
      fiscalInvoiceId: params.fiscalInvoiceId,
      invoiceId: null,
      amount: params.amount,
      matchedBy: params.matchedBy,
      confidence: params.confidence ?? null,
      matchedById: params.matchedById ?? null,
      note: params.note ?? null,
    },
    update: {
      amount: params.amount,
      matchedBy: params.matchedBy,
      confidence: params.confidence ?? null,
      note: params.note ?? null,
    },
  });

  // Recompute fiscal-invoice coverage.
  const sum = await db.paymentAllocation.aggregate({
    where: { fiscalInvoiceId: params.fiscalInvoiceId },
    _sum: { amount: true },
  });
  const paid = sum._sum.amount ?? ZERO;
  const covered =
    fiscal.totalAmount != null && paid.greaterThanOrEqualTo(fiscal.totalAmount);
  if (covered && !fiscal.paidAt) {
    await db.fiscalInvoice.update({
      where: { id: fiscal.id },
      data: { paidAt: new Date() },
    });
  }

  // Reflect coverage on the transaction.
  const tx = await db.bankTransaction.findUnique({
    where: { id: params.bankTransactionId },
    select: { amount: true },
  });
  if (!tx) return;
  const allocatedOnTx = await db.paymentAllocation.aggregate({
    where: { bankTransactionId: params.bankTransactionId },
    _sum: { amount: true },
  });
  const txAllocated = allocatedOnTx._sum.amount ?? ZERO;
  await db.bankTransaction.update({
    where: { id: params.bankTransactionId },
    data: {
      matchStatus: txAllocated.greaterThanOrEqualTo(tx.amount)
        ? "MATCHED"
        : "SUGGESTED",
    },
  });
}

/**
 * Distributes a payment across a buyer's open receivable invoices, oldest
 * first (FIFO). Used for IDNO-only matches where no specific invoice is cited
 * and the amount does not line up with a single invoice. Any surplus is left
 * unallocated on the transaction (it stays SUGGESTED), which is the signal that
 * the client overpaid / an invoice is missing. Returns true if anything was
 * allocated.
 */
async function allocateFifoByBuyer(
  db: Db,
  tx: { id: string; amount: Prisma.Decimal },
  buyerIdno: string,
  confidence: number,
): Promise<boolean> {
  const invoices = await db.fiscalInvoice.findMany({
    where: {
      buyerIdno,
      eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
      paidAt: null,
      AND: [excludeNonDeliveryWhere()],
    },
    select: { id: true, totalAmount: true },
    orderBy: [{ issueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  if (invoices.length === 0) return false;

  const allocated = await allocatedByFiscal(
    db,
    invoices.map((i) => i.id),
  );

  let left = tx.amount;
  let appliedAny = false;
  for (const inv of invoices) {
    if (left.lessThanOrEqualTo(0)) break;
    const remaining =
      inv.totalAmount != null
        ? inv.totalAmount.minus(allocated.get(inv.id) ?? ZERO)
        : null;
    if (remaining != null && remaining.lessThanOrEqualTo(0)) continue;
    const allocate =
      remaining != null ? Prisma.Decimal.min(left, remaining) : left;
    if (allocate.lessThanOrEqualTo(0)) continue;
    await applyAllocation(db, {
      bankTransactionId: tx.id,
      fiscalInvoiceId: inv.id,
      amount: allocate.toFixed(2),
      matchedBy: "AUTO",
      confidence,
    });
    left = left.minus(allocate);
    appliedAny = true;
    // Unknown total: we consumed the whole payment against this invoice.
    if (remaining == null) break;
  }
  return appliedAny;
}

export interface AutoMatchResult {
  scanned: number;
  applied: number;
  suggested: number;
}

/**
 * Runs auto-matching over unmatched credit transactions.
 *
 * Routing per transaction (best candidate):
 *  - number cited or exact amount -> apply that specific invoice, but only when
 *    the top candidate is strictly more confident than the runner-up
 *    (ambiguity guard) and confidence >= AUTO_APPLY_THRESHOLD.
 *  - IDNO only (60 single-open / 40 multi-open) -> FIFO across the buyer's open
 *    invoices, oldest first; surplus stays as a signal.
 *  - otherwise -> left for manual review.
 */
export async function runAutoMatch(options: {
  statementId?: string;
  autoApply?: boolean;
}): Promise<AutoMatchResult> {
  const autoApply = options.autoApply ?? true;
  // Terminal acquiring / other operational CREDITS leave the match queue.
  await markOperationalCreditsIgnored({ statementId: options.statementId });

  const txs = await prisma.bankTransaction.findMany({
    where: {
      direction: "CREDIT",
      // Reconsider not-yet-confirmed transactions; skip MATCHED and IGNORED.
      matchStatus: { in: ["UNMATCHED", "SUGGESTED"] },
      ...(options.statementId ? { statementId: options.statementId } : {}),
    },
    select: {
      id: true,
      direction: true,
      amount: true,
      counterpartyIdno: true,
      purpose: true,
    },
  });

  let applied = 0;
  let suggested = 0;

  for (const tx of txs) {
    const suggestions = await computeSuggestions(prisma, tx);
    const best = suggestions[0];
    if (!best) continue;
    if (!autoApply) {
      suggested++;
      continue;
    }

    const idno = tx.counterpartyIdno;
    const targetsSpecificInvoice =
      best.signals.numberMatch || best.signals.amountExact;

    if (targetsSpecificInvoice) {
      const second = suggestions[1];
      const unambiguous = !second || best.confidence > second.confidence;
      if (best.confidence >= AUTO_APPLY_THRESHOLD && unambiguous) {
        await prisma.$transaction((dbtx) =>
          applyAllocation(dbtx, {
            bankTransactionId: tx.id,
            fiscalInvoiceId: best.fiscalInvoiceId,
            amount: best.amount,
            matchedBy: "AUTO",
            confidence: best.confidence,
          }),
        );
        applied++;
      } else {
        suggested++;
      }
    } else if (best.signals.idnoMatch && idno) {
      const didApply = await prisma.$transaction((dbtx) =>
        allocateFifoByBuyer(dbtx, { id: tx.id, amount: tx.amount }, idno, best.confidence),
      );
      if (didApply) applied++;
      else suggested++;
    } else {
      suggested++;
    }
  }

  return { scanned: txs.length, applied, suggested };
}
