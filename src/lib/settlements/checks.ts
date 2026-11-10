/**
 * «Взаиморасчёты → Проверить»: automatic signals. Pure — every input is
 * plain data. Each signal has a stable key (type + counterparty + the
 * documents behind it) so a «Проверено» mark survives reloads and comes back
 * only when the underlying documents change.
 */
import type { CheckSignal, SettlementRow, VatAnomalyReason } from "./types";

const DAY_MS = 86_400_000;
const cents = (n: number): number => Math.round(n * 100);
const mdl = (c: number): number => c / 100;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Days after which an unpaid invoice / unmatched payment is flagged. */
export const STALE_DAYS = 30;
/** Same-amount supplier payments closer than this look like a duplicate. */
export const DUPLICATE_PAYMENT_DAYS = 7;
/** Sales auto-matches below this confidence are worth a look. */
export const LOW_CONFIDENCE = 60;
const MAX_DOCS = 6;

/** Short stable hash (FNV-1a 32-bit, base36) for long id lists in keys. */
export function stableHash(parts: readonly string[]): string {
  let h = 0x811c9dc5;
  const text = [...parts].sort().join("|");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export interface CheckPayment {
  id: string;
  amount: number;
  date: Date;
  kind: "bank" | "card";
  document: string;
}

export interface CheckInvoice {
  id: string;
  document: string;
  total: number;
  issueDate: Date | null;
  paidOnSpot: boolean;
  receiptDate?: Date | null;
}

export interface CheckAllocation {
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: "suggested" | "confirmed" | "rejected";
}

export interface CheckSupplier {
  idno: string;
  payments: readonly CheckPayment[];
  invoices: readonly CheckInvoice[];
  allocations: readonly CheckAllocation[];
}

export interface LowConfidenceSale {
  allocationId: string;
  idno: string;
  name: string | null;
  amount: number;
  date: Date;
  confidence: number;
  document: string;
}

export interface VatSalesInvoice {
  document: string;
  idno: string | null;
  total: number;
  vat: number | null;
  date: Date | null;
}

export interface VatPurchaseInvoice extends VatSalesInvoice {
  totalExVat: number | null;
  /** Sum of line VAT when every line has it; null otherwise. */
  linesVat: number | null;
}

export interface ChecksInput {
  now: Date;
  rows: readonly SettlementRow[];
  suppliers: ReadonlyMap<string, CheckSupplier>;
  /** Supplier matching has run at least once (else 5–6 would flag everything). */
  matchingRan: boolean;
  cards: { unattributedCount: number; unattributedSum: number };
  lowConfidenceSales: readonly LowConfidenceSale[];
  vatSales: readonly VatSalesInvoice[];
  vatPurchases: readonly VatPurchaseInvoice[];
  names?: ReadonlyMap<string, string>;
}

const docsOf = (list: readonly string[]): string[] => list.slice(0, MAX_DOCS);

/** Sales VAT: negative, above the total, or above the 20 % rate (total / 6). */
export function salesVatAnomaly(inv: VatSalesInvoice): VatAnomalyReason | null {
  if (inv.vat == null) return null;
  const vat = cents(inv.vat);
  const total = cents(inv.total);
  if (vat < 0) return "vat_negative";
  if (vat > total) return "vat_over_total";
  if (total > 0 && vat > Math.round(total / 6) + 5) return "vat_over_rate";
  return null;
}

/** Purchase VAT: as sales, plus ex-VAT + VAT ≠ total and line VAT ≠ invoice VAT (±1 MDL). */
export function purchaseVatAnomaly(inv: VatPurchaseInvoice): VatAnomalyReason | null {
  const base = salesVatAnomaly(inv);
  if (base) return base;
  if (inv.vat == null) return null;
  const vat = cents(inv.vat);
  if (inv.totalExVat != null && Math.abs(cents(inv.totalExVat) + vat - cents(inv.total)) > 100) {
    return "sum_mismatch";
  }
  if (inv.linesVat != null && Math.abs(cents(inv.linesVat) - vat) > 100) return "lines_mismatch";
  return null;
}

function nameOf(input: ChecksInput, rows: Map<string, SettlementRow>, idno: string): string | null {
  return rows.get(idno)?.name ?? input.names?.get(idno) ?? null;
}

/** Not a trading party or marked «Прочее»: payment-pattern checks are noise there. */
function quietParty(row: SettlementRow | undefined): boolean {
  if (!row) return false;
  return row.state === "service" || row.state === "unclassified" || row.category === "other";
}

export function computeChecks(input: ChecksInput): CheckSignal[] {
  const out: CheckSignal[] = [];
  const rows = new Map(input.rows.map((r) => [r.idno, r]));
  const nowMs = input.now.getTime();

  // 1–3: flags already computed with the balances.
  for (const r of input.rows) {
    for (const f of r.flags) {
      if (f.kind === "duplicate_sale") {
        out.push({
          key: `duplicate_sale:${r.idno}:${[...f.documents].sort().join(",")}`,
          type: "duplicate_sale",
          idno: r.idno,
          name: r.name,
          amount: f.amount,
          date: f.dates[f.dates.length - 1] ?? null,
          documents: f.documents,
          side: "sales",
        });
      } else if (f.kind === "payment_without_invoice") {
        out.push({
          key: `payment_without_invoice:${r.idno}:${stableHash(f.dates.map((d, i) => `${d}#${f.documents[i] ?? ""}`))}`,
          type: "payment_without_invoice",
          idno: r.idno,
          name: r.name,
          amount: f.amount,
          date: [...f.dates].sort().pop() ?? null,
          documents: docsOf(f.documents),
          count: f.dates.length,
          side: "sales",
        });
      } else if (f.kind === "supplier_overpaid") {
        out.push({
          key: `supplier_overpaid:${r.idno}:${f.amount.toFixed(2)}`,
          type: "supplier_overpaid",
          idno: r.idno,
          name: r.name,
          amount: f.amount,
          date: r.lastActivity,
          documents: [],
          side: "purchase",
        });
      }
    }
  }

  for (const s of input.suppliers.values()) {
    const row = rows.get(s.idno);
    const name = nameOf(input, rows, s.idno);
    const linked = new Map<string, number>();
    const paidByInvoice = new Map<string, number>();
    const bankLinkedToSpot: CheckAllocation[] = [];
    const spot = new Set(s.invoices.filter((i) => i.paidOnSpot).map((i) => i.id));
    const kindOf = new Map(s.payments.map((p) => [p.id, p.kind]));
    /** Invoices each payment is confirmed against. */
    const linkedElsewhere = new Map<string, string[]>();
    for (const a of s.allocations) {
      if (a.status === "rejected") continue;
      linked.set(a.paymentId, (linked.get(a.paymentId) ?? 0) + cents(a.amount));
      if (a.status === "confirmed") {
        linkedElsewhere.set(a.paymentId, [...(linkedElsewhere.get(a.paymentId) ?? []), a.invoiceId]);
        paidByInvoice.set(a.invoiceId, (paidByInvoice.get(a.invoiceId) ?? 0) + cents(a.amount));
        if (spot.has(a.invoiceId) && kindOf.get(a.paymentId) === "bank") bankLinkedToSpot.push(a);
      }
    }

    // 4. Same amount paid twice within 7 days, fewer than two invoices of it.
    if (!quietParty(row)) {
      const sorted = [...s.payments].sort((a, b) => a.date.getTime() - b.date.getTime());
      const used = new Set<string>();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i]!;
          const b = sorted[j]!;
          if (b.date.getTime() - a.date.getTime() > DUPLICATE_PAYMENT_DAYS * DAY_MS) break;
          if (cents(a.amount) !== cents(b.amount) || used.has(a.id) || used.has(b.id)) continue;
          const lo = a.date.getTime() - 90 * DAY_MS;
          const hi = b.date.getTime() + 30 * DAY_MS;
          const invoices = s.invoices.filter(
            (inv) =>
              cents(inv.total) === cents(a.amount) &&
              inv.issueDate &&
              inv.issueDate.getTime() >= lo &&
              inv.issueDate.getTime() <= hi,
          ).length;
          if (invoices >= 2) continue;
          used.add(a.id);
          used.add(b.id);
          out.push({
            key: `duplicate_payment:${s.idno}:${[a.id, b.id].sort().join(",")}`,
            type: "duplicate_payment",
            idno: s.idno,
            name,
            amount: a.amount,
            date: iso(b.date),
            documents: [a.document, b.document],
            side: "purchase",
          });
        }
      }
    }

    // 5. Invoices unpaid > 30 days after matching, while we owe them overall.
    if (input.matchingRan && row && row.state === "we_owe") {
      const owed = cents(row.purchaseNet) + Math.max(-cents(row.openingBalance), 0);
      const open = s.invoices
        .filter((inv) => !inv.paidOnSpot && inv.issueDate && nowMs - inv.issueDate.getTime() > STALE_DAYS * DAY_MS)
        .map((inv) => ({ inv, left: cents(inv.total) - (paidByInvoice.get(inv.id) ?? 0) }))
        .filter((x) => x.left > 0)
        .sort((a, b) => a.inv.issueDate!.getTime() - b.inv.issueDate!.getTime());
      const sum = open.reduce((t, x) => t + x.left, 0);
      const amount = Math.min(sum, owed);
      if (open.length > 0 && amount > 0) {
        const oldest = open[0]!.inv.issueDate!;
        out.push({
          key: `supplier_unpaid:${s.idno}:${stableHash(open.map((x) => x.inv.id))}`,
          type: "supplier_unpaid",
          idno: s.idno,
          name,
          amount: mdl(amount),
          date: iso(oldest),
          documents: docsOf(open.map((x) => x.inv.document)),
          count: open.length,
          ageDays: Math.floor((nowMs - oldest.getTime()) / DAY_MS),
          side: "purchase",
        });
      }
    }

    // 6. Payments with no invoice linked after 30 days.
    if (input.matchingRan && !quietParty(row)) {
      const lonely = s.payments
        .filter((p) => !linked.has(p.id) && nowMs - p.date.getTime() > STALE_DAYS * DAY_MS)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      if (lonely.length > 0) {
        out.push({
          key: `payment_unmatched:${s.idno}:${stableHash(lonely.map((p) => p.id))}`,
          type: "payment_unmatched",
          idno: s.idno,
          name,
          amount: mdl(lonely.reduce((t, p) => t + cents(p.amount), 0)),
          date: iso(lonely[0]!.date),
          documents: docsOf(lonely.map((p) => p.document)),
          count: lonely.length,
          ageDays: Math.floor((nowMs - lonely[0]!.date.getTime()) / DAY_MS),
          side: "purchase",
        });
      }
    }

    // 10. Invoice paid on the spot (B/f) and by a bank transfer of the same amount.
    const seen = new Set<string>();
    for (const inv of s.invoices) {
      if (!inv.paidOnSpot) continue;
      const at = (inv.receiptDate ?? inv.issueDate)?.getTime();
      const direct = bankLinkedToSpot.filter((a) => a.invoiceId === inv.id).map((a) => a.paymentId);
      const sameAmount =
        at == null
          ? []
          : s.payments
              .filter(
                (p) =>
                  p.kind === "bank" &&
                  !linkedElsewhere.get(p.id)?.some((invId) => invId !== inv.id && !spot.has(invId)) &&
                  cents(p.amount) === cents(inv.total) &&
                  Math.abs(p.date.getTime() - at) <= 30 * DAY_MS,
              )
              .map((p) => p.id);
      for (const paymentId of [...new Set([...direct, ...sameAmount])]) {
        if (seen.has(paymentId)) continue;
        seen.add(paymentId);
        const p = s.payments.find((x) => x.id === paymentId);
        out.push({
          key: `receipt_and_bank:${inv.id}:${paymentId}`,
          type: "receipt_and_bank",
          idno: s.idno,
          name,
          amount: inv.total,
          date: iso(p?.date ?? inv.issueDate),
          documents: [inv.document, p?.document ?? "—"],
          side: "purchase",
        });
        break;
      }
    }
  }

  // 7. Card purchases not attributed to anyone.
  if (input.cards.unattributedCount > 0) {
    out.push({
      key: `card_unattributed:${input.cards.unattributedCount}:${input.cards.unattributedSum.toFixed(2)}`,
      type: "card_unattributed",
      idno: null,
      name: null,
      amount: input.cards.unattributedSum,
      date: null,
      documents: [],
      count: input.cards.unattributedCount,
      side: "purchase",
    });
  }

  // 8. Low-confidence sales auto-matches, grouped per buyer.
  const lowByIdno = new Map<string, LowConfidenceSale[]>();
  for (const l of input.lowConfidenceSales) {
    if (l.confidence >= LOW_CONFIDENCE) continue;
    const list = lowByIdno.get(l.idno) ?? [];
    list.push(l);
    lowByIdno.set(l.idno, list);
  }
  for (const [idno, list] of lowByIdno) {
    const sorted = [...list].sort((a, b) => b.date.getTime() - a.date.getTime());
    out.push({
      key: `low_confidence_sales:${idno}:${stableHash(list.map((l) => l.allocationId))}`,
      type: "low_confidence_sales",
      idno,
      name: rows.get(idno)?.name ?? list[0]!.name ?? input.names?.get(idno) ?? null,
      amount: mdl(list.reduce((t, l) => t + cents(l.amount), 0)),
      date: iso(sorted[0]!.date),
      documents: docsOf([...new Set(sorted.map((l) => l.document))]),
      count: list.length,
      confidence: Math.min(...list.map((l) => l.confidence)),
      side: "sales",
    });
  }

  // 9. VAT anomalies.
  for (const inv of input.vatSales) {
    const reason = salesVatAnomaly(inv);
    if (!reason) continue;
    out.push({
      key: `vat_anomaly:sales:${inv.document}`,
      type: "vat_anomaly",
      idno: inv.idno,
      name: inv.idno ? nameOf(input, rows, inv.idno) : null,
      amount: inv.vat ?? 0,
      date: iso(inv.date),
      documents: [inv.document],
      side: "sales",
      vatReason: reason,
    });
  }
  for (const inv of input.vatPurchases) {
    const reason = purchaseVatAnomaly(inv);
    if (!reason) continue;
    out.push({
      key: `vat_anomaly:purchase:${inv.document}`,
      type: "vat_anomaly",
      idno: inv.idno,
      name: inv.idno ? nameOf(input, rows, inv.idno) : null,
      amount: inv.vat ?? 0,
      date: iso(inv.date),
      documents: [inv.document],
      side: "purchase",
      vatReason: reason,
    });
  }

  const order = new Map<string, number>(
    [
      "duplicate_payment",
      "receipt_and_bank",
      "duplicate_sale",
      "supplier_overpaid",
      "vat_anomaly",
      "supplier_unpaid",
      "payment_unmatched",
      "payment_without_invoice",
      "low_confidence_sales",
      "card_unattributed",
    ].map((t, i) => [t, i]),
  );
  return out.sort(
    (a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99) || Math.abs(b.amount) - Math.abs(a.amount),
  );
}
