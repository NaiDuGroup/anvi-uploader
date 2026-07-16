import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import {
  RECEIVABLE_EFACTURA_STATUSES,
  STATEMENT_EFACTURA_STATUSES,
} from "./autoMatch";
import {
  excludeNonDeliveryWhere,
  isNonDeliveryFiscal,
} from "./fiscalFlags";
import {
  extractInvoiceRefs,
  splitFiscalToken,
  suggestHistoricalDocument,
} from "./match";
import { DEFAULT_OPERATIONAL_IDNOS } from "./operational";

const ZERO = new Prisma.Decimal(0);

/** Payment term (days) after which an unpaid fiscal invoice counts as overdue. */
const OVERDUE_DAYS = 15;
const DAY_MS = 86_400_000;

export interface DebtorRow {
  /** Buyer fiscal code — the stable reconciliation key. */
  buyerIdno: string;
  /** Linked internal client id, when the fiscal invoice was matched. */
  clientId: string | null;
  clientName: string;
  openInvoices: number;
  outstanding: string;
  /** Payment deadline of the oldest open invoice (issue date + term). */
  oldestDueDate: string | null;
  hasOverdue: boolean;
  /** Days past the oldest invoice's due date; null when not overdue. */
  daysOverdue: number | null;
}

/** Sums allocations per fiscal invoice id. */
async function allocatedByFiscal(
  ids: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const map = new Map<string, Prisma.Decimal>();
  if (ids.length === 0) return map;
  const grouped = await prisma.paymentAllocation.groupBy({
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
 * Per-buyer outstanding balance across receivable fiscal invoices from
 * e-Factura. A fully paid (paidAt) invoice contributes zero.
 */
export async function computeDebtorReport(): Promise<{
  debtors: DebtorRow[];
  totalOutstanding: string;
}> {
  const invoices = await prisma.fiscalInvoice.findMany({
    where: {
      eFacturaStatus: { in: RECEIVABLE_EFACTURA_STATUSES },
      paidAt: null,
      totalAmount: { not: null },
      AND: [excludeNonDeliveryWhere()],
    },
    select: {
      id: true,
      totalAmount: true,
      issueDate: true,
      buyerIdno: true,
      buyerName: true,
      clientId: true,
      redirections: true,
    },
  });

  const allocated = await allocatedByFiscal(invoices.map((i) => i.id));
  const now = Date.now();

  const byBuyer = new Map<
    string,
    DebtorRow & { _out: Prisma.Decimal; _oldestIssue: Date | null }
  >();
  for (const inv of invoices) {
    if (isNonDeliveryFiscal(inv.redirections)) continue;
    const key = inv.buyerIdno ?? inv.buyerName ?? "unknown";
    const outstanding = (inv.totalAmount ?? ZERO).minus(
      allocated.get(inv.id) ?? ZERO,
    );
    if (outstanding.lessThanOrEqualTo(0)) continue;
    const existing = byBuyer.get(key);
    if (existing) {
      existing._out = existing._out.plus(outstanding);
      existing.openInvoices += 1;
      if (inv.clientId && !existing.clientId) existing.clientId = inv.clientId;
      if (
        inv.issueDate &&
        (!existing._oldestIssue || inv.issueDate < existing._oldestIssue)
      ) {
        existing._oldestIssue = inv.issueDate;
      }
    } else {
      byBuyer.set(key, {
        buyerIdno: inv.buyerIdno ?? key,
        clientId: inv.clientId,
        clientName: inv.buyerName?.trim() || "—",
        openInvoices: 1,
        outstanding: "0",
        oldestDueDate: null,
        hasOverdue: false,
        daysOverdue: null,
        _out: outstanding,
        _oldestIssue: inv.issueDate ?? null,
      });
    }
  }

  let total = ZERO;
  const debtors: DebtorRow[] = [];
  for (const row of byBuyer.values()) {
    total = total.plus(row._out);
    let oldestDueDate: string | null = null;
    let daysOverdue: number | null = null;
    if (row._oldestIssue) {
      const due = new Date(row._oldestIssue.getTime() + OVERDUE_DAYS * DAY_MS);
      oldestDueDate = due.toISOString();
      const diff = Math.floor((now - due.getTime()) / DAY_MS);
      daysOverdue = diff > 0 ? diff : null;
    }
    debtors.push({
      buyerIdno: row.buyerIdno,
      clientId: row.clientId,
      clientName: row.clientName,
      openInvoices: row.openInvoices,
      outstanding: row._out.toFixed(2),
      oldestDueDate,
      hasOverdue: daysOverdue != null,
      daysOverdue,
    });
  }
  debtors.sort((a, b) => Number(b.outstanding) - Number(a.outstanding));

  return { debtors, totalOutstanding: total.toFixed(2) };
}

/** One party's net position: positive = owes us, listed as `amount` (absolute). */
export interface BalanceRow {
  buyerIdno: string;
  clientId: string | null;
  clientName: string;
  openInvoices: number;
  /** Absolute balance (MDL) — receivable for debtors, overpayment for creditors. */
  amount: string;
  /** Debtors only: payment deadline of the oldest uncovered invoice. */
  oldestDueDate: string | null;
  daysOverdue: number | null;
  /** Operational rows added via UI can be removed; built-in defaults cannot. */
  removable?: boolean;
}

export interface BalanceReport {
  /** Clients that owe us money (net balance > 0). */
  debtors: BalanceRow[];
  /** Clients we owe / that overpaid (net balance < 0) — a missing-invoice signal. */
  creditors: BalanceRow[];
  /** Bank/terminal/owner deposits — not real clients, no invoice expected. */
  operational: BalanceRow[];
  summary: {
    totalReceivable: string;
    totalCredit: string;
    debtorCount: number;
    creditorCount: number;
    overdueCount: number;
    operationalTotal: string;
    operationalCount: number;
    aging: { current: string; d1_15: string; d16_30: string; d30plus: string };
  };
}

/** Rounding tolerance so cent-level noise doesn't create phantom rows. */
const BALANCE_TOLERANCE = new Prisma.Decimal("0.005");

async function loadDbExclusions(): Promise<Array<{ idno: string; name: string | null }>> {
  try {
    return await prisma.reconciliationExclusion.findMany({
      select: { idno: true, name: true },
    });
  } catch {
    // Stale Prisma client or table not migrated yet — built-in defaults still apply.
    return [];
  }
}

/**
 * Per-client net balance over the full billing history — the same figure the
 * reconciliation act settles on. Invoices are debits; incoming bank payments
 * (by fiscal code) and B/f POS receipts are credits. Clients split by sign:
 * positive balances owe us (debtors, with overdue aging), negative balances
 * mean they paid more than was invoiced (likely a fiscal invoice the accountant
 * never issued).
 */
export async function computeBalanceReport(): Promise<BalanceReport> {
  const company = await getOrCreateCompanyProfile();
  const ownIdno = company.fiscalCode;

  const [invoices, credits, historicalCredits, creditNames, dbExclusions] =
    await Promise.all([
      prisma.fiscalInvoice.findMany({
        where: {
          eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
          totalAmount: { not: null },
          AND: [excludeNonDeliveryWhere()],
        },
        select: {
          totalAmount: true,
          issueDate: true,
          buyerIdno: true,
          buyerName: true,
          clientId: true,
          receiptSettledAt: true,
          redirections: true,
        },
      }),
      prisma.bankTransaction.groupBy({
        by: ["counterpartyIdno"],
        where: { direction: "CREDIT", counterpartyIdno: { not: null } },
        _sum: { amount: true },
      }),
      // Pre-e-Factura settlements: synthetic debit so HISTORICAL credits do not
      // push the client into the creditors list.
      prisma.bankTransaction.groupBy({
        by: ["counterpartyIdno"],
        where: {
          direction: "CREDIT",
          matchStatus: "HISTORICAL",
          counterpartyIdno: { not: null },
        },
        _sum: { amount: true },
      }),
      prisma.bankTransaction.findMany({
        where: { direction: "CREDIT", counterpartyIdno: { not: null } },
        distinct: ["counterpartyIdno"],
        orderBy: { bookingDate: "desc" },
        select: { counterpartyIdno: true, counterpartyName: true },
      }),
      loadDbExclusions(),
    ]);

  const dbIdnos = new Set(dbExclusions.map((e) => e.idno));
  const operationalSet = new Set<string>([
    ...DEFAULT_OPERATIONAL_IDNOS,
    ...dbIdnos,
  ]);

  const paidByIdno = new Map<string, Prisma.Decimal>();
  for (const c of credits) {
    if (c.counterpartyIdno) {
      paidByIdno.set(c.counterpartyIdno, c._sum.amount ?? ZERO);
    }
  }
  const historicalByIdno = new Map<string, Prisma.Decimal>();
  for (const c of historicalCredits) {
    if (c.counterpartyIdno) {
      historicalByIdno.set(c.counterpartyIdno, c._sum.amount ?? ZERO);
    }
  }
  const nameByIdno = new Map<string, string>();
  for (const n of creditNames) {
    if (n.counterpartyIdno && n.counterpartyName?.trim()) {
      nameByIdno.set(n.counterpartyIdno, n.counterpartyName.trim());
    }
  }

  type Acc = {
    buyerIdno: string;
    clientId: string | null;
    clientName: string;
    invoiced: Prisma.Decimal;
    receiptCredit: Prisma.Decimal;
    invoiceCount: number;
    invoiceDates: Array<{ date: Date; amount: Prisma.Decimal }>;
  };
  const byIdno = new Map<string, Acc>();
  for (const inv of invoices) {
    if (isNonDeliveryFiscal(inv.redirections)) continue;
    const key = inv.buyerIdno ?? inv.buyerName ?? "unknown";
    const total = inv.totalAmount ?? ZERO;
    let acc = byIdno.get(key);
    if (!acc) {
      acc = {
        buyerIdno: inv.buyerIdno ?? key,
        clientId: inv.clientId,
        clientName: inv.buyerName?.trim() || "—",
        invoiced: ZERO,
        receiptCredit: ZERO,
        invoiceCount: 0,
        invoiceDates: [],
      };
      byIdno.set(key, acc);
    }
    acc.invoiced = acc.invoiced.plus(total);
    acc.invoiceCount += 1;
    if (inv.clientId && !acc.clientId) acc.clientId = inv.clientId;
    if (inv.receiptSettledAt) acc.receiptCredit = acc.receiptCredit.plus(total);
    if (inv.issueDate) acc.invoiceDates.push({ date: inv.issueDate, amount: total });
  }

  // Clients who paid but have no fiscal invoice at all — the clearest
  // "accountant never issued an invoice" signal — only exist among payments.
  for (const idno of paidByIdno.keys()) {
    if (byIdno.has(idno)) continue;
    byIdno.set(idno, {
      buyerIdno: idno,
      clientId: null,
      clientName: nameByIdno.get(idno) ?? "—",
      invoiced: ZERO,
      receiptCredit: ZERO,
      invoiceCount: 0,
      invoiceDates: [],
    });
  }

  const now = Date.now();
  const debtors: BalanceRow[] = [];
  const creditors: BalanceRow[] = [];
  const operational: BalanceRow[] = [];
  let totalReceivable = ZERO;
  let totalCredit = ZERO;
  let totalOperational = ZERO;
  let overdueCount = 0;
  const aging = { current: ZERO, d1_15: ZERO, d16_30: ZERO, d30plus: ZERO };

  for (const acc of byIdno.values()) {
    if (acc.buyerIdno === ownIdno) continue;

    const paid = (paidByIdno.get(acc.buyerIdno) ?? ZERO).plus(acc.receiptCredit);
    const historicalInvoiced = historicalByIdno.get(acc.buyerIdno) ?? ZERO;
    const balance = acc.invoiced.plus(historicalInvoiced).minus(paid);

    if (operationalSet.has(acc.buyerIdno)) {
      if (paid.greaterThan(BALANCE_TOLERANCE)) {
        totalOperational = totalOperational.plus(paid);
        operational.push({
          buyerIdno: acc.buyerIdno,
          clientId: acc.clientId,
          clientName:
            dbExclusions.find((e) => e.idno === acc.buyerIdno)?.name?.trim() ||
            acc.clientName,
          openInvoices: acc.invoiceCount,
          amount: paid.toFixed(2),
          oldestDueDate: null,
          daysOverdue: null,
          removable: dbIdnos.has(acc.buyerIdno),
        });
      }
      continue;
    }

    if (balance.greaterThan(BALANCE_TOLERANCE)) {
      // FIFO-cover the oldest invoices with everything paid to date; the first
      // still-uncovered invoice sets the overdue clock.
      let coverage = paid;
      let oldestUncovered: Date | null = null;
      const sorted = [...acc.invoiceDates].sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      );
      for (const { date, amount } of sorted) {
        if (coverage.greaterThanOrEqualTo(amount)) {
          coverage = coverage.minus(amount);
        } else {
          oldestUncovered = date;
          break;
        }
      }

      let oldestDueDate: string | null = null;
      let daysOverdue: number | null = null;
      if (oldestUncovered) {
        const due = new Date(oldestUncovered.getTime() + OVERDUE_DAYS * DAY_MS);
        oldestDueDate = due.toISOString();
        const diff = Math.floor((now - due.getTime()) / DAY_MS);
        daysOverdue = diff > 0 ? diff : null;
      }

      totalReceivable = totalReceivable.plus(balance);
      if (daysOverdue != null) {
        overdueCount += 1;
        if (daysOverdue <= 15) aging.d1_15 = aging.d1_15.plus(balance);
        else if (daysOverdue <= 30) aging.d16_30 = aging.d16_30.plus(balance);
        else aging.d30plus = aging.d30plus.plus(balance);
      } else {
        aging.current = aging.current.plus(balance);
      }

      debtors.push({
        buyerIdno: acc.buyerIdno,
        clientId: acc.clientId,
        clientName: acc.clientName,
        openInvoices: acc.invoiceCount,
        amount: balance.toFixed(2),
        oldestDueDate,
        daysOverdue,
      });
    } else if (balance.lessThan(BALANCE_TOLERANCE.negated())) {
      const credit = balance.negated();
      totalCredit = totalCredit.plus(credit);
      creditors.push({
        buyerIdno: acc.buyerIdno,
        clientId: acc.clientId,
        clientName: acc.clientName,
        openInvoices: acc.invoiceCount,
        amount: credit.toFixed(2),
        oldestDueDate: null,
        daysOverdue: null,
      });
    }
  }

  debtors.sort((a, b) => Number(b.amount) - Number(a.amount));
  creditors.sort((a, b) => Number(b.amount) - Number(a.amount));
  operational.sort((a, b) => Number(b.amount) - Number(a.amount));

  return {
    debtors,
    creditors,
    operational,
    summary: {
      totalReceivable: totalReceivable.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      debtorCount: debtors.length,
      creditorCount: creditors.length,
      overdueCount,
      operationalTotal: totalOperational.toFixed(2),
      operationalCount: operational.length,
      aging: {
        current: aging.current.toFixed(2),
        d1_15: aging.d1_15.toFixed(2),
        d16_30: aging.d16_30.toFixed(2),
        d30plus: aging.d30plus.toFixed(2),
      },
    },
  };
}

export type StatementEntryKind =
  | "invoice"
  | "payment"
  | "receipt"
  | "paper_invoice"
  | "historical_invoice";

export interface StatementEntry {
  kind: StatementEntryKind;
  /** ISO date of the movement (invoice issue date / payment booking date). */
  date: string | null;
  /** Fiscal invoice number, or the payment document number / purpose. */
  document: string;
  /** Secondary line: payment purpose, etc. */
  description: string | null;
  /** Amount owed to us (invoice total), or "0.00". */
  debit: string;
  /** Amount received (payment), or "0.00". */
  credit: string;
  /** Running balance after this entry (debit - credit, cumulative). */
  balance: string;
  /** For invoice rows: whether the fiscal invoice is fully paid. */
  paid: boolean;
  /** Fiscal invoice id or bank transaction id. */
  sourceId: string;
  /**
   * Payment cites a paper (non-e-Factura) fiscal invoice in the purpose, or
   * this row is the synthetic debit that nets those payments in the act.
   */
  paperFiscal?: boolean;
  /** Normalized paper tokens cited on a payment row (e.g. AAQ4557640). */
  paperRefs?: string[];
  /** R2/local key for a receipt photo (POS / cash settle). */
  receiptPhotoKey?: string | null;
}

export interface ClientStatement {
  buyer: {
    idno: string;
    name: string;
  };
  entries: StatementEntry[];
  totalInvoiced: string;
  totalPaid: string;
  /** Final running balance; negative means the client overpaid (advance). */
  totalOutstanding: string;
  generatedAt: string;
}

/** Sortable timestamp for a movement; null dates sort to the end. */
function sortKey(date: Date | null): number {
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
}

/**
 * Reconciliation act ("act de verificare") data for one buyer, rendered as a
 * classic two-sided ledger: fiscal invoices are debits (client owes us),
 * incoming bank payments (by fiscal code) are credits, with a running balance.
 */
export async function computeClientStatement(
  buyerIdno: string,
): Promise<ClientStatement | null> {
  const [invoices, payments] = await Promise.all([
    prisma.fiscalInvoice.findMany({
      // A reconciliation act needs the FULL billing history, so archived (6)
      // invoices are included here (unlike the debtor report / auto-match).
      // Non-livrare creation-reason invoices are excluded (not delivery FF).
      where: {
        buyerIdno,
        eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
        AND: [excludeNonDeliveryWhere()],
      },
      select: {
        id: true,
        seria: true,
        number: true,
        issueDate: true,
        totalAmount: true,
        paidAt: true,
        buyerName: true,
        receiptRef: true,
        receiptMethod: true,
        receiptSettledAt: true,
        receiptPhotoKey: true,
        redirections: true,
      },
    }),
    prisma.bankTransaction.findMany({
      where: { direction: "CREDIT", counterpartyIdno: buyerIdno },
      select: {
        id: true,
        bookingDate: true,
        amount: true,
        purpose: true,
        documentNumber: true,
        counterpartyName: true,
        matchStatus: true,
        historicalDocument: true,
      },
    }),
  ]);

  if (invoices.length === 0 && payments.length === 0) return null;

  type Movement = {
    sort: number;
    entry: Omit<StatementEntry, "balance">;
  };

  const movements: Movement[] = [];

  for (const inv of invoices) {
    if (isNonDeliveryFiscal(inv.redirections)) continue;
    const total = inv.totalAmount ?? ZERO;
    movements.push({
      sort: sortKey(inv.issueDate),
      entry: {
        kind: "invoice",
        date: inv.issueDate?.toISOString() ?? null,
        document: `${inv.seria}${inv.number}`,
        description: null,
        debit: total.toFixed(2),
        credit: "0.00",
        paid: !!inv.paidAt,
        sourceId: inv.id,
      },
    });

    // Fiscal receipt (B/f): the invoice was collected at the POS terminal, so
    // add a synthetic credit — the money never appears as a bank transfer.
    if (inv.receiptSettledAt) {
      movements.push({
        sort: sortKey(inv.receiptSettledAt) + 1, // just after its invoice
        entry: {
          kind: "receipt",
          date: inv.receiptSettledAt.toISOString(),
          document: inv.receiptRef?.trim() || `${inv.seria}${inv.number}`,
          description: inv.receiptMethod,
          debit: "0.00",
          credit: total.toFixed(2),
          paid: true,
          sourceId: `receipt:${inv.id}`,
          receiptPhotoKey: inv.receiptPhotoKey,
        },
      });
    }
  }

  // Paper FF (AAQ4557640 etc.): one synthetic debit per citing payment, on that
  // payment's date — so we do not front-load later instalments into early balance.
  const paperPayments: {
    paymentId: string;
    token: string;
    amount: Prisma.Decimal;
    bookingDate: Date;
  }[] = [];

  for (const p of payments) {
    const refs = extractInvoiceRefs(p.purpose);
    const paperRefs = refs.paperTokens;
    const token = paperRefs[0] ?? null;
    const isHistorical = p.matchStatus === "HISTORICAL";
    if (isHistorical) {
      const doc =
        p.historicalDocument?.trim() ||
        suggestHistoricalDocument(p.purpose);
      movements.push({
        sort: sortKey(p.bookingDate),
        entry: {
          kind: "historical_invoice",
          date: p.bookingDate.toISOString(),
          document: doc,
          description: null,
          debit: p.amount.toFixed(2),
          credit: "0.00",
          paid: true,
          sourceId: `historical:${p.id}`,
        },
      });
    }
    movements.push({
      sort: sortKey(p.bookingDate) + 1, // credit after same-day paper/historical debit
      entry: {
        kind: "payment",
        date: p.bookingDate.toISOString(),
        document: p.documentNumber?.trim() || "—",
        description: p.purpose?.trim() || null,
        debit: "0.00",
        credit: p.amount.toFixed(2),
        paid: false,
        sourceId: p.id,
        paperFiscal: paperRefs.length > 0,
        paperRefs: paperRefs.length > 0 ? paperRefs : undefined,
      },
    });
    // Skip auto paper-FF synth when the payment was explicitly settled as
    // HISTORICAL (avoids double debit for AAQ… purposes marked manually).
    if (token && !isHistorical) {
      paperPayments.push({
        paymentId: p.id,
        token,
        amount: new Prisma.Decimal(p.amount),
        bookingDate: p.bookingDate,
      });
    }
  }

  if (paperPayments.length > 0) {
    const uniqueTokens = [...new Set(paperPayments.map((x) => x.token))];
    const tokenParts = uniqueTokens
      .map((t) => splitFiscalToken(t))
      .filter((p): p is { seria: string; number: string } => p !== null);

    const existing =
      tokenParts.length === 0
        ? []
        : await prisma.fiscalInvoice.findMany({
            where: {
              OR: tokenParts.map((p) => ({
                seria: p.seria,
                number: p.number,
              })),
            },
            select: { seria: true, number: true },
          });
    const existingKeys = new Set(existing.map((e) => `${e.seria}${e.number}`));

    for (const pp of paperPayments) {
      if (existingKeys.has(pp.token)) continue;
      movements.push({
        sort: sortKey(pp.bookingDate),
        entry: {
          kind: "paper_invoice",
          date: pp.bookingDate.toISOString(),
          document: pp.token,
          description: null, // UI/PDF fill localized "paper FF" label
          debit: pp.amount.toFixed(2),
          credit: "0.00",
          paid: true,
          sourceId: `paper:${pp.token}:${pp.paymentId}`,
          paperFiscal: true,
          paperRefs: [pp.token],
        },
      });
    }
  }

  movements.sort((a, b) => a.sort - b.sort);

  let totalInvoiced = ZERO;
  let totalPaid = ZERO;
  let running = ZERO;
  const entries: StatementEntry[] = movements.map((m) => {
    const debit = new Prisma.Decimal(m.entry.debit);
    const credit = new Prisma.Decimal(m.entry.credit);
    totalInvoiced = totalInvoiced.plus(debit);
    totalPaid = totalPaid.plus(credit);
    running = running.plus(debit).minus(credit);
    return { ...m.entry, balance: running.toFixed(2) };
  });

  const buyerName =
    invoices.find((i) => i.buyerName)?.buyerName?.trim() ||
    payments.find((p) => p.counterpartyName)?.counterpartyName?.trim() ||
    "—";

  return {
    buyer: { idno: buyerIdno, name: buyerName },
    entries,
    totalInvoiced: totalInvoiced.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    totalOutstanding: running.toFixed(2),
    generatedAt: new Date().toISOString(),
  };
}
