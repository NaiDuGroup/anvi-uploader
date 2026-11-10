/**
 * DB side of the supplier matching: loads payments / invoices / links per
 * supplier IDNO, runs the pure engine and stores suggestions, plus the
 * confirm / reject / manual / undo actions behind the API.
 *
 * Stale links: a link holds while its invoice is live and its payment is
 * still attributed to the invoice's IDNO (bank transfer counterparty or card
 * alias / name / amount attribution). Otherwise a suggested link is deleted
 * and a confirmed one gets `stale_reason` (shown as «Связь устарела», counts
 * nowhere). The pure context build recomputes staleness on every load; the DB
 * column is synced by `syncStaleSupplierAllocations` at the start of every
 * auto run, on the supplier card GET and before confirm / manual links.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadRefunds } from "@/lib/reconciliation/credits";
import { loadOperationalIdnos } from "@/lib/reconciliation/operational";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { supplierPaymentCents } from "./balance";
import { resolveCategory } from "./categories";
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
  creditNoteOffsets,
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
  /** «Сверка → Не клиенты»: service parties unless a manual category says otherwise (same rule as the balances). */
  operationalIdnos?: ReadonlySet<string>;
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
  /** Why a link no longer holds (null = fine). Recomputed by `buildSupplierContexts`. */
  staleReason?: StaleReason | null;
  /** Invoice document / IDNO from the DB row (also for invoices that left the live set). */
  invoiceDocument?: string | null;
  invoiceIdno?: string | null;
}

export type StaleReason = "payment_moved" | "invoice_gone";

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

function asStale(s: string | null | undefined): StaleReason | null {
  return s === "payment_moved" || s === "invoice_gone" ? s : null;
}

export async function loadSupplierSources(): Promise<SupplierSources> {
  const [purchases, debits, categories, refunds, company, operational] = await Promise.all([
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
    loadOperationalIdnos(),
  ]);
  const { cards } = await loadCardPurchases(purchases.map(toSettlementPurchase), categories);
  return {
    purchases,
    debits: debits.map((d) => ({ ...d, amount: num(d.amount) })),
    cards,
    refundedByTx: refundedByTx(refunds),
    categories,
    ownIdno: company.fiscalCode || null,
    operationalIdnos: operational,
  };
}

export async function loadSupplierAllocations(
  where: Prisma.SupplierPaymentAllocationWhereInput = {},
): Promise<SupplierAllocationRow[]> {
  const rows = await prisma.supplierPaymentAllocation.findMany({
    where,
    include: { purchaseInvoice: { select: { seria: true, number: true, supplierIdno: true } } },
  });
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
    staleReason: asStale(r.staleReason),
    invoiceDocument: r.purchaseInvoice ? `${r.purchaseInvoice.seria}${r.purchaseInvoice.number}` : null,
    invoiceIdno: r.purchaseInvoice?.supplierIdno ?? null,
  }));
}

function resolved(idno: string, src: SupplierSources) {
  return resolveCategory({
    idno,
    manual: src.categories.get(idno)?.category ?? null,
    hasPurchaseInvoices: true,
    hasSalesInvoices: false,
    operational: src.operationalIdnos?.has(idno) ?? false,
  });
}

function categoryOf(idno: string, src: SupplierSources): CounterpartyCategoryCode | null {
  const r = resolved(idno, src);
  return r.source === "manual" || r.source === "default" ? r.category : null;
}

/** Service party (tax, bank, own, staff, courier, operational IDNO) or our own IDNO: never matched. */
export function isSupplierMatchSkipped(idno: string, src: SupplierSources): boolean {
  if (src.ownIdno && idno === src.ownIdno) return true;
  return resolved(idno, src).service;
}

export interface SupplierLinkIndex {
  /** Live invoice → supplier IDNO. */
  invoiceIdno: Map<string, string>;
  /** Payment (bank debit / card purchase) → IDNO it is attributed to now (null = nobody). */
  paymentIdno: Map<string, string | null>;
}

/** Where every invoice and payment belongs right now (before any skip). */
export function buildLinkIndex(src: SupplierSources): SupplierLinkIndex {
  const invoiceIdno = new Map<string, string>();
  for (const p of src.purchases) if (p.supplierIdno) invoiceIdno.set(p.id, p.supplierIdno);
  const paymentIdno = new Map<string, string | null>();
  for (const d of src.debits) paymentIdno.set(d.id, d.counterpartyIdno?.trim() || null);
  for (const c of src.cards) paymentIdno.set(c.debitId, c.ignored ? null : c.idno || null);
  return { invoiceIdno, paymentIdno };
}

/** Why a suggested / confirmed link no longer holds; null when it does (rejected links never go stale). */
export function staleReasonOf(
  a: Pick<SupplierAllocationRow, "paymentId" | "invoiceId" | "status">,
  index: SupplierLinkIndex,
): StaleReason | null {
  if (a.status === "rejected") return null;
  const invIdno = index.invoiceIdno.get(a.invoiceId);
  if (!invIdno) return "invoice_gone";
  if ((index.paymentIdno.get(a.paymentId) ?? null) !== invIdno) return "payment_moved";
  return null;
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
    return isSupplierMatchSkipped(idno, src);
  };
  const get = (idno: string, name: string | null): SupplierContext => {
    let c = ctxs.get(idno);
    if (!c) {
      c = {
        idno,
        name: src.categories.get(idno)?.name?.trim() || null,
        category: categoryOf(idno, src),
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

  for (const p of src.purchases) {
    if (!p.supplierIdno || skip(p.supplierIdno)) continue;
    const ctx = get(p.supplierIdno, p.supplierName);
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

  // A link belongs to its invoice's supplier and to its payment's current
  // supplier: a payment linked to a cancelled invoice or re-attributed to
  // another IDNO must still be seen as used (or as stale) on both sides.
  const index = buildLinkIndex(src);
  for (const a of allocations) {
    const row: SupplierAllocationRow = { ...a, staleReason: staleReasonOf(a, index) };
    const invIdno = index.invoiceIdno.get(a.invoiceId) ?? a.invoiceIdno ?? null;
    const payIdno = index.paymentIdno.get(a.paymentId) ?? null;
    const a1 = invIdno ? ctxs.get(invIdno) : undefined;
    const a2 = payIdno && payIdno !== invIdno ? ctxs.get(payIdno) : undefined;
    if (a1) a1.allocations.push(row);
    if (a2) a2.allocations.push(row);
  }
  return ctxs;
}

/** Links of a context as the engine sees them (stale confirmed links count nowhere). */
export function engineAllocations(ctx: SupplierContext) {
  return ctx.allocations
    .filter((a) => a.status !== "suggested")
    .map((a) => ({ paymentId: a.paymentId, invoiceId: a.invoiceId, amount: a.amount, status: a.status, stale: Boolean(a.staleReason) }));
}

/** Confirmed, non-stale amount per invoice (MDL). */
function confirmedByInvoice(ctx: SupplierContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of ctx.allocations) {
    if (a.status !== "confirmed" || a.staleReason) continue;
    out.set(a.invoiceId, (cents(out.get(a.invoiceId) ?? 0) + cents(a.amount)) / 100);
  }
  return out;
}

/**
 * Brings `stale_reason` in the DB in line with the current attribution:
 * deletes stale suggestions, marks / clears confirmed links. Returns the
 * allocation list as it is after the sync. Safe to call often (no-op when
 * nothing changed). Call after a card alias / category change too.
 */
export async function syncStaleSupplierAllocations(
  src?: SupplierSources,
  rows?: SupplierAllocationRow[],
): Promise<{ allocations: SupplierAllocationRow[]; deleted: number; marked: number; cleared: number }> {
  const sources = src ?? (await loadSupplierSources());
  const allocations = rows ?? (await loadSupplierAllocations());
  const index = buildLinkIndex(sources);
  const drop: string[] = [];
  const mark = new Map<StaleReason, string[]>();
  const clear: string[] = [];
  const out: SupplierAllocationRow[] = [];
  for (const a of allocations) {
    const reason = staleReasonOf(a, index);
    if (a.status === "suggested" && reason) {
      drop.push(a.id);
      continue;
    }
    if (a.status === "confirmed") {
      if (reason && reason !== (a.staleReason ?? null)) mark.set(reason, [...(mark.get(reason) ?? []), a.id]);
      else if (!reason && a.staleReason) clear.push(a.id);
    }
    out.push({ ...a, staleReason: a.status === "confirmed" ? reason : null });
  }
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (drop.length > 0) {
    ops.push(prisma.supplierPaymentAllocation.deleteMany({ where: { id: { in: drop }, status: "suggested" } }));
  }
  for (const [reason, ids] of mark) {
    ops.push(prisma.supplierPaymentAllocation.updateMany({ where: { id: { in: ids } }, data: { staleReason: reason } }));
  }
  if (clear.length > 0) {
    ops.push(prisma.supplierPaymentAllocation.updateMany({ where: { id: { in: clear } }, data: { staleReason: null } }));
  }
  if (ops.length > 0) await prisma.$transaction(ops);
  return {
    allocations: out,
    deleted: drop.length,
    marked: [...mark.values()].reduce((n, l) => n + l.length, 0),
    cleared: clear.length,
  };
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

/**
 * Replaces one supplier's suggestions with fresh ones; returns counts.
 * Auto-confirmed links are capped again with the DB totals inside the
 * transaction (as confirm / manual allocate do): if another link appeared
 * meanwhile, the rest stays a suggestion.
 */
async function matchOne(
  ctx: SupplierContext,
): Promise<{ suggested: number; confirmed: Array<{ invoiceId: string; paymentId: string; amount: number; reason: string; confidence: number }> }> {
  const suggestions = suggestSupplierMatches({
    payments: ctx.payments,
    invoices: ctx.invoices,
    allocations: engineAllocations(ctx),
  });
  const now = new Date();
  const invIds = ctx.invoices.map((i) => i.id);
  const payIds = ctx.payments.map((p) => p.id);
  const payById = new Map(ctx.payments.map((p) => [p.id, p]));
  const invById = new Map(ctx.invoices.map((i) => [i.id, i]));
  const confirmed: Array<{ invoiceId: string; paymentId: string; amount: number; reason: string; confidence: number }> = [];
  let suggested = 0;
  await prisma.$transaction(async (db) => {
    await db.supplierPaymentAllocation.deleteMany({
      where: {
        status: "suggested",
        OR: [{ purchaseInvoiceId: { in: invIds } }, { bankTransactionId: { in: payIds } }],
      },
    });
    const rows: Prisma.SupplierPaymentAllocationCreateManyInput[] = [];
    for (const s of suggestions) {
      let amount = s.amount;
      let auto = s.autoConfirm;
      if (auto) {
        const capped = capAllocation({
          requested: s.amount,
          paymentAmount: payById.get(s.paymentId)?.amount ?? 0,
          paymentAllocatedElsewhere: await confirmedElsewhere(db, { bankTransactionId: s.paymentId }, null),
          invoiceTotal: invById.get(s.invoiceId)?.total ?? 0,
          invoiceAllocatedElsewhere: await confirmedElsewhere(db, { purchaseInvoiceId: s.invoiceId }, null),
        });
        if (capped <= 0) continue;
        if (cents(capped) < cents(s.amount)) {
          auto = false;
          amount = capped;
        } else {
          // Visible to the next cap in this loop.
          await db.supplierPaymentAllocation.createMany({
            data: [
              {
                bankTransactionId: s.paymentId,
                purchaseInvoiceId: s.invoiceId,
                amount: new Prisma.Decimal(amount.toFixed(2)),
                status: "confirmed",
                confidence: s.confidence,
                reason: s.reason,
                confirmedAt: now,
              },
            ],
            skipDuplicates: true,
          });
          confirmed.push({ invoiceId: s.invoiceId, paymentId: s.paymentId, amount, reason: s.reason, confidence: s.confidence });
          continue;
        }
      }
      suggested += 1;
      rows.push({
        bankTransactionId: s.paymentId,
        purchaseInvoiceId: s.invoiceId,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        status: "suggested",
        confidence: s.confidence,
        reason: s.reason,
        confirmedAt: null,
      });
    }
    if (rows.length > 0) await db.supplierPaymentAllocation.createMany({ data: rows, skipDuplicates: true });
  }, TX_OPTIONS);
  return { suggested, confirmed };
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
  const [sources, loaded] = await Promise.all([loadSupplierSources(), loadSupplierAllocations()]);
  // Stale links first (all suppliers): re-attributed payments / cancelled invoices.
  const { allocations } = await syncStaleSupplierAllocations(sources, loaded);
  const ctxs = buildSupplierContexts(sources, allocations, only);
  // Suppliers with leftover suggestions are processed too, so they get cleared
  // even when no payment (or no invoice) is left.
  const idnos = [...ctxs.values()]
    .filter(
      (c) =>
        (c.invoices.length > 0 && c.payments.length > 0) || c.allocations.some((a) => a.status === "suggested"),
    )
    .map((c) => c.idno)
    .sort();
  let index = options.cursor ? idnos.findIndex((x) => x > options.cursor!) : 0;
  if (index < 0) index = idnos.length;

  let processed = 0;
  let suggested = 0;
  let confirmedCount = 0;
  const log: AuditEntry[] = [];
  let last: string | null = null;
  // Auto actions are logged as «Автоматически» (userId null) with who started the run.
  const startedBy = options.actor ? { startedBy: options.actor.name, startedById: options.actor.id } : {};
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
        details: {
          document: docOf.get(c.invoiceId),
          bankTransactionId: c.paymentId,
          reason: c.reason,
          confidence: c.confidence,
          ...startedBy,
        },
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
    details: { processed, suggested, confirmed: confirmedCount, remaining, total: idnos.length, ...startedBy },
  });
  await writeAudit(null, log);
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
  /** Set when the link no longer holds («Связь устарела»). */
  staleReason: StaleReason | null;
}

export interface SupplierInvoiceDto {
  id: string;
  document: string;
  issueDate: string | null;
  total: number;
  /** Confirmed links, capped at the total. */
  paid: number;
  /** Netted by credit notes of this supplier. */
  creditOffset: number;
  /** Confirmed links above the total (excluded from `paid`). */
  overAllocated: number;
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
  /** Confirmed links that no longer hold: shown with «Отвязать». */
  stale: SupplierLinkDto[];
  counts: Record<InvoicePaymentStatus, number>;
}

export function toSupplierCard(ctx: SupplierContext | undefined, idno: string): SupplierMatchCardResponse {
  const counts: Record<InvoicePaymentStatus, number> = { paid: 0, partial: 0, unpaid: 0, receipt: 0, credit: 0 };
  if (!ctx) return { idno, invoices: [], payments: [], suggestions: [], stale: [], counts };
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
      invoiceDocument: i?.document ?? a.invoiceDocument ?? null,
      invoiceDate: i?.issueDate?.toISOString() ?? null,
      invoiceTotal: i?.total ?? null,
      staleReason: a.staleReason ?? null,
    };
  };
  const live = ctx.allocations.filter((a) => a.status !== "rejected" && !a.staleReason);
  const offsets = creditNoteOffsets(ctx.invoices, confirmedByInvoice(ctx));
  const invoices: SupplierInvoiceDto[] = [...ctx.invoices]
    .sort((a, b) => (b.issueDate?.getTime() ?? 0) - (a.issueDate?.getTime() ?? 0))
    .map((i) => {
      const links = live.filter((a) => a.invoiceId === i.id).map(link);
      const linked = links.filter((l) => l.status === "confirmed").reduce((s, l) => s + cents(l.amount), 0);
      const cap = Math.max(cents(i.total), 0);
      const paid = Math.min(linked, cap) / 100;
      const creditOffset = offsets.get(i.id) ?? 0;
      const status = invoicePaymentStatus(i.total, paid, i.paidOnSpot, creditOffset);
      counts[status] += 1;
      return {
        id: i.id,
        document: i.document,
        issueDate: i.issueDate?.toISOString() ?? null,
        total: i.total,
        paid,
        creditOffset,
        overAllocated: Math.max(linked - cap, 0) / 100,
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
  const seenStale = new Set<string>();
  const stale = ctx.allocations
    .filter((a) => a.status === "confirmed" && a.staleReason && !seenStale.has(a.id) && seenStale.add(a.id))
    .map(link);
  return { idno, invoices, payments, suggestions, stale, counts };
}

export async function loadSupplierCard(idno: string): Promise<SupplierMatchCardResponse> {
  const [sources, loaded] = await Promise.all([loadSupplierSources(), loadSupplierAllocations()]);
  const { allocations } = await syncStaleSupplierAllocations(sources, loaded);
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
    where: { ...where, status: "confirmed", staleReason: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
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
  /** Why ids were skipped (id → reason), when known. */
  skippedReasons?: Record<string, string>;
}

/** Current attribution, with stale links synced first (so DB caps see them). */
async function freshIndex(): Promise<{ sources: SupplierSources; index: SupplierLinkIndex }> {
  const sources = await loadSupplierSources();
  await syncStaleSupplierAllocations(sources);
  return { sources, index: buildLinkIndex(sources) };
}

export async function confirmSupplierAllocations(ids: string[], actor: AuditActor | null): Promise<ActionResult> {
  const log: AuditEntry[] = [];
  let done = 0;
  let skipped = 0;
  const skippedReasons: Record<string, string> = {};
  const refunds: RefundCache = new Map();
  const { index } = await freshIndex();
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
      // The payment must still belong to the invoice's supplier and the invoice be live.
      const stale = staleReasonOf({ paymentId: r.bankTransactionId, invoiceId: r.purchaseInvoiceId, status: "suggested" }, index);
      if (stale) {
        skipped += 1;
        skippedReasons[r.id] = stale;
        continue;
      }
      const amount = capAllocation({
        requested: num(r.amount),
        paymentAmount: await paymentAmount(r.bankTransaction, refunds),
        paymentAllocatedElsewhere: await confirmedElsewhere(db, { bankTransactionId: r.bankTransactionId }, r.id),
        invoiceTotal: num(r.purchaseInvoice.totalAmount),
        invoiceAllocatedElsewhere: await confirmedElsewhere(db, { purchaseInvoiceId: r.purchaseInvoiceId }, r.id),
      });
      if (amount <= 0) {
        skipped += 1;
        skippedReasons[r.id] = "fully_allocated";
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
  return { done, skipped, skippedReasons };
}

export async function rejectSupplierAllocations(ids: string[], actor: AuditActor | null): Promise<ActionResult> {
  const { index } = await freshIndex();
  const found = await prisma.supplierPaymentAllocation.findMany({
    where: { id: { in: ids }, status: "suggested" },
    include: { purchaseInvoice: { select: { supplierIdno: true, seria: true, number: true } } },
  });
  // Stale suggestions were just deleted by the sync; never remember a rejection for them.
  const skippedReasons: Record<string, string> = {};
  const rows = found.filter((r) => {
    const stale = staleReasonOf({ paymentId: r.bankTransactionId, invoiceId: r.purchaseInvoiceId, status: "suggested" }, index);
    if (stale) skippedReasons[r.id] = stale;
    return !stale;
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
  return { done: rows.length, skipped: ids.length - rows.length, skippedReasons };
}

export class SupplierMatchError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Manual link of one payment to invoices. The payment must be a supplier
 * payment (bank transfer or attributed card purchase, not a fee) of a
 * matched supplier; each invoice must be a live invoice of that same IDNO,
 * not paid on the spot (B/f), with a positive total. Others are skipped.
 */
export async function manualSupplierAllocate(
  input: { bankTransactionId: string; allocations: Array<{ purchaseInvoiceId: string; amount: number }> },
  actor: AuditActor | null,
): Promise<ActionResult> {
  const log: AuditEntry[] = [];
  let done = 0;
  let skipped = 0;
  const skippedReasons: Record<string, string> = {};
  const { sources, index } = await freshIndex();
  const idno = index.paymentIdno.get(input.bankTransactionId) ?? null;
  const ctx = idno ? buildSupplierContexts(sources, [], new Set([idno])).get(idno) : undefined;
  const payment = ctx?.payments.find((p) => p.id === input.bankTransactionId);
  await prisma.$transaction(async (db) => {
    const tx = await db.bankTransaction.findUnique({
      where: { id: input.bankTransactionId },
      select: { id: true, amount: true, direction: true, counterpartyIdno: true, documentNumber: true },
    });
    if (!tx) throw new SupplierMatchError("payment_not_found");
    if (tx.direction !== "DEBIT") throw new SupplierMatchError("not_a_payment");
    if (!ctx || !payment) throw new SupplierMatchError("not_a_supplier_payment");
    const total = payment.amount;
    const invById = new Map(ctx.invoices.map((i) => [i.id, i]));
    const invoices = await db.purchaseInvoice.findMany({
      where: { id: { in: input.allocations.map((a) => a.purchaseInvoiceId) } },
      select: { id: true, totalAmount: true, supplierIdno: true, seria: true, number: true },
    });
    const byId = new Map(invoices.map((i) => [i.id, i]));
    for (const a of input.allocations) {
      const inv = byId.get(a.purchaseInvoiceId);
      const live = invById.get(a.purchaseInvoiceId);
      const why = !inv
        ? "invoice_not_found"
        : !live || inv.supplierIdno !== ctx.idno
          ? "other_supplier_or_not_live"
          : live.paidOnSpot
            ? "paid_on_spot"
            : num(inv.totalAmount) <= 0
              ? "not_positive"
              : null;
      if (why || !inv) {
        skipped += 1;
        skippedReasons[a.purchaseInvoiceId] = why ?? "invoice_not_found";
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
        skippedReasons[a.purchaseInvoiceId] = "fully_allocated";
        continue;
      }
      const data = {
        amount: new Prisma.Decimal(amount.toFixed(2)),
        status: "confirmed",
        confidence: 100,
        reason: "Связано вручную",
        staleReason: null,
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
  return { done, skipped, skippedReasons };
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
