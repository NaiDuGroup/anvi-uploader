/**
 * DB side of the supplier matching: loads payments / invoices / links per
 * supplier IDNO, runs the pure engine and stores suggestions, plus the
 * confirm / reject / manual / undo actions behind the API.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadRefunds } from "@/lib/reconciliation/credits";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { supplierPaymentCents } from "./balance";
import { DEFAULT_COUNTERPARTY_CATEGORIES, SERVICE_CATEGORIES } from "./categories";
import { receiptsNotCoveredByCard, type CardPurchase } from "./cardPurchases";
import {
  loadCardPurchases,
  loadLivePurchases,
  loadManualCategories,
  refundedByTx,
  toSettlementPurchase,
  type PurchaseRow,
  type SettlementsInternals,
} from "./load";
import {
  capAllocation,
  invoicePaymentStatus,
  suggestSupplierMatches,
  type InvoicePaymentStatus,
  type SmInvoice,
  type SmPayment,
  type SupplierAllocationStatus,
} from "./supplierMatch";
import { writeAudit, type AuditActor, type AuditEntry } from "./audit";
import type { CounterpartyCategoryCode } from "./types";

const num = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));
const cents = (n: number): number => Math.round(n * 100);

export interface SupplierSources {
  purchases: PurchaseRow[];
  debits: SettlementsInternals["debits"];
  cards: CardPurchase[];
  refundedByTx: ReadonlyMap<string, number>;
  categories: SettlementsInternals["categories"];
  ownIdno: string | null;
}

export interface SupplierInvoiceRow extends SmInvoice {
  document: string;
  supplierName: string | null;
  receiptRef: string | null;
  receiptMethod: string | null;
  receiptDate: Date | null;
}

export interface SupplierAllocationRow {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: SupplierAllocationStatus;
  confidence: number;
  reason: string | null;
  createdById: string | null;
  confirmedById: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

export interface SupplierContext {
  idno: string;
  name: string | null;
  /** Manual or built-in category (null = guessed / none). */
  category: CounterpartyCategoryCode | null;
  payments: SmPayment[];
  invoices: SupplierInvoiceRow[];
  allocations: SupplierAllocationRow[];
}

function asStatus(s: string): SupplierAllocationStatus {
  return s === "confirmed" || s === "rejected" ? s : "suggested";
}

export async function loadSupplierSources(): Promise<SupplierSources> {
  const [purchases, debits, categories, refunds, company] = await Promise.all([
    loadLivePurchases(),
    prisma.bankTransaction.findMany({
      where: { direction: "DEBIT", currency: "MDL", counterpartyIdno: { not: null } },
      select: {
        id: true,
        amount: true,
        bookingDate: true,
        counterpartyIdno: true,
        counterpartyName: true,
        txTypeCode: true,
        documentNumber: true,
        purpose: true,
      },
    }),
    loadManualCategories(),
    loadRefunds(prisma),
    getOrCreateCompanyProfile(),
  ]);
  const { cards } = await loadCardPurchases(purchases.map(toSettlementPurchase), categories);
  return {
    purchases,
    debits: debits.map((d) => ({ ...d, amount: num(d.amount) })),
    cards,
    refundedByTx: refundedByTx(refunds),
    categories,
    ownIdno: company.fiscalCode || null,
  };
}

export async function loadSupplierAllocations(
  where: Prisma.SupplierPaymentAllocationWhereInput = {},
): Promise<SupplierAllocationRow[]> {
  const rows = await prisma.supplierPaymentAllocation.findMany({ where });
  return rows.map((r) => ({
    id: r.id,
    paymentId: r.bankTransactionId,
    invoiceId: r.purchaseInvoiceId,
    amount: num(r.amount),
    status: asStatus(r.status),
    confidence: r.confidence,
    reason: r.reason,
    createdById: r.createdById,
    confirmedById: r.confirmedById,
    confirmedAt: r.confirmedAt,
    createdAt: r.createdAt,
  }));
}

function categoryOf(
  idno: string,
  categories: SupplierSources["categories"],
): CounterpartyCategoryCode | null {
  return categories.get(idno)?.category ?? DEFAULT_COUNTERPARTY_CATEGORIES[idno] ?? null;
}

/** Groups payments, invoices and links by supplier IDNO (service parties and our own IDNO skipped). */
export function buildSupplierContexts(
  src: SupplierSources,
  allocations: readonly SupplierAllocationRow[],
  only?: ReadonlySet<string>,
): Map<string, SupplierContext> {
  const ctxs = new Map<string, SupplierContext>();
  const skip = (idno: string): boolean => {
    if (only && !only.has(idno)) return true;
    if (src.ownIdno && idno === src.ownIdno) return true;
    const cat = categoryOf(idno, src.categories);
    return cat != null && SERVICE_CATEGORIES.has(cat);
  };
  const get = (idno: string, name: string | null): SupplierContext => {
    let c = ctxs.get(idno);
    if (!c) {
      c = {
        idno,
        name: src.categories.get(idno)?.name?.trim() || null,
        category: categoryOf(idno, src.categories),
        payments: [],
        invoices: [],
        allocations: [],
      };
      ctxs.set(idno, c);
    }
    if (!c.name && name?.trim()) c.name = name.trim();
    return c;
  };

  const attributed = src.cards.filter((c) => c.idno);
  const cardIds = new Set(attributed.map((c) => c.debitId));

  // B/f receipts absorbed by a card payment are paid by that card (a link is expected).
  const keptReceipts = new Set(
    receiptsNotCoveredByCard(
      src.purchases.flatMap((p) =>
        p.receiptSettledAt && p.supplierIdno
          ? [
              {
                document: p.id,
                supplierIdno: p.supplierIdno,
                amount: num(p.totalAmount),
                date: p.receiptSettledAt ?? p.issueDate ?? new Date(0),
              },
            ]
          : [],
      ),
      attributed.map((c) => ({ debitId: c.debitId, idno: c.idno!, amount: c.amount, date: c.purchaseDate })),
    ).map((r) => r.document),
  );

  const invoiceIdno = new Map<string, string>();
  for (const p of src.purchases) {
    if (!p.supplierIdno || skip(p.supplierIdno)) continue;
    const ctx = get(p.supplierIdno, p.supplierName);
    invoiceIdno.set(p.id, p.supplierIdno);
    ctx.invoices.push({
      id: p.id,
      seria: p.seria,
      number: p.number,
      document: `${p.seria}${p.number}`,
      total: num(p.totalAmount),
      issueDate: p.issueDate,
      paidOnSpot: keptReceipts.has(p.id),
      supplierName: p.supplierName,
      receiptRef: p.receiptRef,
      receiptMethod: p.receiptMethod,
      receiptDate: p.receiptSettledAt,
    });
  }

  for (const d of src.debits) {
    if (!d.counterpartyIdno || cardIds.has(d.id) || skip(d.counterpartyIdno)) continue;
    const counted = supplierPaymentCents(d, src.refundedByTx);
    if (counted <= 0) continue;
    get(d.counterpartyIdno, d.counterpartyName).payments.push({
      id: d.id,
      amount: counted / 100,
      date: d.bookingDate,
      purpose: d.purpose,
      kind: "bank",
      document: d.documentNumber?.trim() || "—",
    });
  }
  for (const c of attributed) {
    if (skip(c.idno!) || c.amount <= 0) continue;
    get(c.idno!, null).payments.push({
      id: c.debitId,
      amount: Math.round(c.amount * 100) / 100,
      date: c.purchaseDate,
      purpose: c.purpose,
      kind: "card",
      document: c.merchantRaw,
    });
  }

  for (const a of allocations) {
    const idno = invoiceIdno.get(a.invoiceId);
    const ctx = idno ? ctxs.get(idno) : undefined;
    if (ctx) ctx.allocations.push(a);
  }
  return ctxs;
}

/* ------------------------------------------------------------------ */
/* Auto-match                                                          */
/* ------------------------------------------------------------------ */

export interface SupplierAutoMatchResult {
  processed: number;
  total: number;
  remaining: number;
  /** Pass back as `cursor` to continue; null when done. */
  nextCursor: string | null;
  suggested: number;
  confirmed: number;
}

/** Replaces one supplier's suggestions with fresh ones; returns counts. */
async function matchOne(
  ctx: SupplierContext,
): Promise<{ suggested: number; confirmed: Array<{ invoiceId: string; paymentId: string; amount: number; reason: string; confidence: number }> }> {
  const fixed = ctx.allocations.filter((a) => a.status !== "suggested");
  const suggestions = suggestSupplierMatches({
    payments: ctx.payments,
    invoices: ctx.invoices,
    allocations: fixed,
  });
  const now = new Date();
  const invIds = ctx.invoices.map((i) => i.id);
  const payIds = ctx.payments.map((p) => p.id);
  await prisma.$transaction([
    prisma.supplierPaymentAllocation.deleteMany({
      where: {
        status: "suggested",
        OR: [{ purchaseInvoiceId: { in: invIds } }, { bankTransactionId: { in: payIds } }],
      },
    }),
    prisma.supplierPaymentAllocation.createMany({
      data: suggestions.map((s) => ({
        bankTransactionId: s.paymentId,
        purchaseInvoiceId: s.invoiceId,
        amount: new Prisma.Decimal(s.amount.toFixed(2)),
        status: s.autoConfirm ? "confirmed" : "suggested",
        confidence: s.confidence,
        reason: s.reason,
        confirmedAt: s.autoConfirm ? now : null,
      })),
      skipDuplicates: true,
    }),
  ]);
  return {
    suggested: suggestions.filter((s) => !s.autoConfirm).length,
    confirmed: suggestions
      .filter((s) => s.autoConfirm)
      .map((s) => ({ invoiceId: s.invoiceId, paymentId: s.paymentId, amount: s.amount, reason: s.reason, confidence: s.confidence })),
  };
}

/**
 * Runs the engine over one IDNO or all suppliers in IDNO order, from `cursor`
 * (exclusive) until `budgetMs` is spent. Suggestions are replaced; confirmed
 * and rejected links stay.
 */
export async function runSupplierAutoMatch(options: {
  idno?: string | null;
  cursor?: string | null;
  budgetMs?: number;
  actor?: AuditActor | null;
}): Promise<SupplierAutoMatchResult> {
  const started = Date.now();
  const budget = options.budgetMs ?? 40_000;
  const only = options.idno ? new Set([options.idno]) : undefined;
  const [sources, allocations] = await Promise.all([loadSupplierSources(), loadSupplierAllocations()]);
  const ctxs = buildSupplierContexts(sources, allocations, only);
  const idnos = [...ctxs.values()]
    .filter((c) => c.invoices.length > 0 && c.payments.length > 0)
    .map((c) => c.idno)
    .sort();
  let index = options.cursor ? idnos.findIndex((x) => x > options.cursor!) : 0;
  if (index < 0) index = idnos.length;

  let processed = 0;
  let suggested = 0;
  let confirmedCount = 0;
  const log: AuditEntry[] = [];
  let last: string | null = null;
  while (index < idnos.length) {
    if (processed > 0 && Date.now() - started > budget) break;
    const ctx = ctxs.get(idnos[index]!)!;
    const r = await matchOne(ctx);
    suggested += r.suggested;
    confirmedCount += r.confirmed.length;
    const docOf = new Map(ctx.invoices.map((i) => [i.id, i.document]));
    for (const c of r.confirmed) {
      log.push({
        action: "auto_confirm",
        entityType: "purchase_invoice",
        entityId: c.invoiceId,
        counterpartyIdno: ctx.idno,
        amount: c.amount,
        details: { document: docOf.get(c.invoiceId), bankTransactionId: c.paymentId, reason: c.reason, confidence: c.confidence },
      });
    }
    last = ctx.idno;
    processed += 1;
    index += 1;
  }
  const remaining = idnos.length - index;
  log.push({
    action: "supplier_auto_match",
    entityType: "run",
    counterpartyIdno: options.idno ?? null,
    details: { processed, suggested, confirmed: confirmedCount, remaining, total: idnos.length },
  });
  await writeAudit(options.actor ?? null, log);
  return {
    processed,
    total: idnos.length,
    remaining,
    nextCursor: remaining > 0 ? last : null,
    suggested,
    confirmed: confirmedCount,
  };
}

/* ------------------------------------------------------------------ */
/* Card DTO                                                            */
/* ------------------------------------------------------------------ */

export interface SupplierLinkDto {
  allocationId: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: SupplierAllocationStatus;
  confidence: number;
  reason: string | null;
  auto: boolean;
  paymentDate: string | null;
  paymentAmount: number | null;
  paymentKind: "bank" | "card" | null;
  paymentDocument: string | null;
  invoiceDocument: string | null;
  invoiceDate: string | null;
  invoiceTotal: number | null;
}

export interface SupplierInvoiceDto {
  id: string;
  document: string;
  issueDate: string | null;
  total: number;
  paid: number;
  status: InvoicePaymentStatus;
  receiptRef: string | null;
  receiptMethod: string | null;
  links: SupplierLinkDto[];
}

export interface SupplierPaymentDto {
  id: string;
  date: string;
  amount: number;
  kind: "bank" | "card";
  document: string;
  purpose: string | null;
  /** Confirmed links. */
  allocated: number;
  links: SupplierLinkDto[];
}

export interface SupplierMatchCardResponse {
  idno: string;
  invoices: SupplierInvoiceDto[];
  payments: SupplierPaymentDto[];
  suggestions: SupplierLinkDto[];
  counts: Record<InvoicePaymentStatus, number>;
}

export function toSupplierCard(ctx: SupplierContext | undefined, idno: string): SupplierMatchCardResponse {
  const counts: Record<InvoicePaymentStatus, number> = { paid: 0, partial: 0, unpaid: 0, receipt: 0 };
  if (!ctx) return { idno, invoices: [], payments: [], suggestions: [], counts };
  const payById = new Map(ctx.payments.map((p) => [p.id, p]));
  const invById = new Map(ctx.invoices.map((i) => [i.id, i]));
  const link = (a: SupplierAllocationRow): SupplierLinkDto => {
    const p = payById.get(a.paymentId);
    const i = invById.get(a.invoiceId);
    return {
      allocationId: a.id,
      paymentId: a.paymentId,
      invoiceId: a.invoiceId,
      amount: a.amount,
      status: a.status,
      confidence: a.confidence,
      reason: a.reason,
      auto: a.createdById == null,
      paymentDate: p ? p.date.toISOString() : null,
      paymentAmount: p ? p.amount : null,
      paymentKind: p?.kind ?? null,
      paymentDocument: p?.document ?? null,
      invoiceDocument: i?.document ?? null,
      invoiceDate: i?.issueDate?.toISOString() ?? null,
      invoiceTotal: i?.total ?? null,
    };
  };
  const live = ctx.allocations.filter((a) => a.status !== "rejected");
  const invoices: SupplierInvoiceDto[] = [...ctx.invoices]
    .sort((a, b) => (b.issueDate?.getTime() ?? 0) - (a.issueDate?.getTime() ?? 0))
    .map((i) => {
      const links = live.filter((a) => a.invoiceId === i.id).map(link);
      const paid = links.filter((l) => l.status === "confirmed").reduce((s, l) => s + cents(l.amount), 0) / 100;
      const status = invoicePaymentStatus(i.total, paid, i.paidOnSpot);
      counts[status] += 1;
      return {
        id: i.id,
        document: i.document,
        issueDate: i.issueDate?.toISOString() ?? null,
        total: i.total,
        paid,
        status,
        receiptRef: i.receiptRef,
        receiptMethod: i.receiptMethod,
        links,
      };
    });
  const payments: SupplierPaymentDto[] = [...ctx.payments]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((p) => {
      const links = live.filter((a) => a.paymentId === p.id).map(link);
      return {
        id: p.id,
        date: p.date.toISOString(),
        amount: p.amount,
        kind: p.kind,
        document: p.document,
        purpose: p.purpose,
        allocated: links.filter((l) => l.status === "confirmed").reduce((s, l) => s + cents(l.amount), 0) / 100,
        links,
      };
    });
  const suggestions = live
    .filter((a) => a.status === "suggested")
    .map(link)
    .sort((a, b) => b.confidence - a.confidence || (a.paymentDate ?? "").localeCompare(b.paymentDate ?? ""));
  return { idno, invoices, payments, suggestions, counts };
}

export async function loadSupplierCard(idno: string): Promise<SupplierMatchCardResponse> {
  const [sources, allocations] = await Promise.all([loadSupplierSources(), loadSupplierAllocations()]);
  const ctxs = buildSupplierContexts(sources, allocations, new Set([idno]));
  return toSupplierCard(ctxs.get(idno), idno);
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

type Tx = Prisma.TransactionClient;

async function confirmedElsewhere(
  db: Tx,
  where: Prisma.SupplierPaymentAllocationWhereInput,
  excludeId: string | null,
): Promise<number> {
  const agg = await db.supplierPaymentAllocation.aggregate({
    where: { ...where, status: "confirmed", ...(excludeId ? { id: { not: excludeId } } : {}) },
    _sum: { amount: true },
  });
  return num(agg._sum.amount);
}

type RefundCache = Map<string, Map<string, number>>;

/** Counted payment amount (refunds deducted for bank transfers); refunds cached per IDNO. */
async function paymentAmount(
  tx: { id: string; amount: Prisma.Decimal; counterpartyIdno: string | null },
  cache: RefundCache,
): Promise<number> {
  if (!tx.counterpartyIdno) return num(tx.amount);
  let byTx = cache.get(tx.counterpartyIdno);
  if (!byTx) {
    byTx = refundedByTx(await loadRefunds(prisma, tx.counterpartyIdno).catch(() => []));
    cache.set(tx.counterpartyIdno, byTx);
  }
  return Math.max(0, Math.round((num(tx.amount) - (byTx.get(tx.id) ?? 0)) * 100) / 100);
}

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

export interface ActionResult {
  done: number;
  skipped: number;
}

export async function confirmSupplierAllocations(ids: string[], actor: AuditActor | null): Promise<ActionResult> {
  const log: AuditEntry[] = [];
  let done = 0;
  let skipped = 0;
  const refunds: RefundCache = new Map();
  await prisma.$transaction(async (db) => {
    const rows = await db.supplierPaymentAllocation.findMany({
      where: { id: { in: ids }, status: "suggested" },
      include: {
        purchaseInvoice: { select: { totalAmount: true, supplierIdno: true, seria: true, number: true } },
        bankTransaction: { select: { id: true, amount: true, counterpartyIdno: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    skipped += ids.length - rows.length;
    for (const r of rows) {
      const amount = capAllocation({
        requested: num(r.amount),
        paymentAmount: await paymentAmount(r.bankTransaction, refunds),
        paymentAllocatedElsewhere: await confirmedElsewhere(db, { bankTransactionId: r.bankTransactionId }, r.id),
        invoiceTotal: num(r.purchaseInvoice.totalAmount),
        invoiceAllocatedElsewhere: await confirmedElsewhere(db, { purchaseInvoiceId: r.purchaseInvoiceId }, r.id),
      });
      if (amount <= 0) {
        skipped += 1;
        continue;
      }
      await db.supplierPaymentAllocation.update({
        where: { id: r.id },
        data: {
          status: "confirmed",
          amount: new Prisma.Decimal(amount.toFixed(2)),
          confirmedById: actor?.id ?? null,
          confirmedAt: new Date(),
        },
      });
      done += 1;
      log.push({
        action: "confirm",
        entityType: "purchase_invoice",
        entityId: r.purchaseInvoiceId,
        counterpartyIdno: r.purchaseInvoice.supplierIdno,
        amount,
        details: {
          document: `${r.purchaseInvoice.seria}${r.purchaseInvoice.number}`,
          bankTransactionId: r.bankTransactionId,
          confidence: r.confidence,
          reason: r.reason,
        },
      });
    }
  }, TX_OPTIONS);
  await writeAudit(actor, log);
  return { done, skipped };
}

export async function rejectSupplierAllocations(ids: string[], actor: AuditActor | null): Promise<ActionResult> {
  const rows = await prisma.supplierPaymentAllocation.findMany({
    where: { id: { in: ids }, status: "suggested" },
    include: { purchaseInvoice: { select: { supplierIdno: true, seria: true, number: true } } },
  });
  if (rows.length > 0) {
    await prisma.supplierPaymentAllocation.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, status: "suggested" },
      data: { status: "rejected", confirmedById: actor?.id ?? null, confirmedAt: new Date() },
    });
  }
  await writeAudit(
    actor,
    rows.map((r) => ({
      action: "reject" as const,
      entityType: "purchase_invoice",
      entityId: r.purchaseInvoiceId,
      counterpartyIdno: r.purchaseInvoice.supplierIdno,
      amount: num(r.amount),
      details: {
        document: `${r.purchaseInvoice.seria}${r.purchaseInvoice.number}`,
        bankTransactionId: r.bankTransactionId,
        confidence: r.confidence,
        reason: r.reason,
      },
    })),
  );
  return { done: rows.length, skipped: ids.length - rows.length };
}

export class SupplierMatchError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function manualSupplierAllocate(
  input: { bankTransactionId: string; allocations: Array<{ purchaseInvoiceId: string; amount: number }> },
  actor: AuditActor | null,
): Promise<ActionResult> {
  const log: AuditEntry[] = [];
  let done = 0;
  let skipped = 0;
  await prisma.$transaction(async (db) => {
    const tx = await db.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: { id: true, amount: true, direction: true, counterpartyIdno: true, documentNumber: true },
    });
    if (!tx) throw new SupplierMatchError("payment_not_found");
    if (tx.direction !== "DEBIT") throw new SupplierMatchError("not_a_payment");
    const total = await paymentAmount(tx, new Map());
    const invoices = await db.purchaseInvoice.findMany({
      where: { id: { in: input.allocations.map((a) => a.purchaseInvoiceId) } },
      select: { id: true, totalAmount: true, supplierIdno: true, seria: true, number: true },
    });
    const byId = new Map(invoices.map((i) => [i.id, i]));
    for (const a of input.allocations) {
      const inv = byId.get(a.purchaseInvoiceId);
      if (!inv) {
        skipped += 1;
        continue;
      }
      const existing = await db.supplierPaymentAllocation.findUnique({
        where: {
          bankTransactionId_purchaseInvoiceId: { bankTransactionId: tx.id, purchaseInvoiceId: inv.id },
        },
        select: { id: true },
      });
      const amount = capAllocation({
        requested: a.amount,
        paymentAmount: total,
        paymentAllocatedElsewhere: await confirmedElsewhere(db, { bankTransactionId: tx.id }, existing?.id ?? null),
        invoiceTotal: num(inv.totalAmount),
        invoiceAllocatedElsewhere: await confirmedElsewhere(db, { purchaseInvoiceId: inv.id }, existing?.id ?? null),
      });
      if (amount <= 0) {
        skipped += 1;
        continue;
      }
      const data = {
        amount: new Prisma.Decimal(amount.toFixed(2)),
        status: "confirmed",
        confidence: 100,
        reason: "Связано вручную",
        createdById: actor?.id ?? null,
        confirmedById: actor?.id ?? null,
        confirmedAt: new Date(),
      };
      await db.supplierPaymentAllocation.upsert({
        where: {
          bankTransactionId_purchaseInvoiceId: { bankTransactionId: tx.id, purchaseInvoiceId: inv.id },
        },
        create: { bankTransactionId: tx.id, purchaseInvoiceId: inv.id, ...data },
        update: data,
      });
      done += 1;
      log.push({
        action: "manual_allocate",
        entityType: "purchase_invoice",
        entityId: inv.id,
        counterpartyIdno: inv.supplierIdno ?? tx.counterpartyIdno,
        amount,
        details: { document: `${inv.seria}${inv.number}`, bankTransactionId: tx.id, paymentDocument: tx.documentNumber },
      });
    }
    if (done > 0) {
      // Suggestions on this payment / these invoices are stale now.
      await db.supplierPaymentAllocation.deleteMany({
        where: {
          status: "suggested",
          OR: [
            { bankTransactionId: tx.id },
            { purchaseInvoiceId: { in: input.allocations.map((a) => a.purchaseInvoiceId) } },
          ],
        },
      });
    }
  }, TX_OPTIONS);
  await writeAudit(actor, log);
  return { done, skipped };
}

/** Removes a confirmed link (or forgets a rejection) so the auto-match may suggest again. */
export async function undoSupplierAllocation(id: string, actor: AuditActor | null): Promise<boolean> {
  const row = await prisma.supplierPaymentAllocation.findUnique({
    where: { id },
    include: { purchaseInvoice: { select: { supplierIdno: true, seria: true, number: true } } },
  });
  if (!row || row.status === "suggested") return false;
  await prisma.supplierPaymentAllocation.delete({ where: { id } });
  await writeAudit(actor, {
    action: "unconfirm",
    entityType: "purchase_invoice",
    entityId: row.purchaseInvoiceId,
    counterpartyIdno: row.purchaseInvoice.supplierIdno,
    amount: num(row.amount),
    details: {
      document: `${row.purchaseInvoice.seria}${row.purchaseInvoice.number}`,
      bankTransactionId: row.bankTransactionId,
      previousStatus: row.status,
    },
  });
  return true;
}
