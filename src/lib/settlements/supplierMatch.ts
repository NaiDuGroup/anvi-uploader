/**
 * «Взаиморасчёты»: which of our payments paid which supplier invoice.
 *
 * Pure suggestion engine per supplier IDNO. Balances stay IDNO-level; these
 * links only explain them invoice by invoice. Candidate payments are bank
 * transfers to the IDNO (refunds deducted) and card purchases attributed to
 * it; open invoices are the live purchase invoices not covered by confirmed
 * links. Invoices paid on the spot (B/f, not absorbed by a card payment) are
 * covered already and never get a link.
 *
 * Passes, in order (each only uses what the previous ones left open):
 *  1. invoice number / series cited in the payment purpose;
 *  2. exact amount equal to one open invoice in the date window;
 *  3. a sum of 2–5 open invoices equal to the payment (oldest first, bounded);
 *  4. FIFO remainder onto the oldest open invoices (weak fallback).
 *
 * Credit notes (negative purchase invoices, «Сторно») never get links: before
 * matching they are netted against the oldest open invoices of the supplier
 * (see `creditNoteOffsets`), so invoice 1000 − storno 200 needs a payment of 800.
 *
 * Confirmed links marked stale (payment moved to another IDNO, invoice no
 * longer live) do not count towards any total.
 *
 * Amounts are integer cents inside; never more than the payment or the
 * invoice's open amount is allocated.
 */

const DAY_MS = 86_400_000;

/** Payment may precede its invoice by this many days (prepayment). */
export const WINDOW_BEFORE_DAYS = 10;
/** …and follow it by this many days. */
export const WINDOW_AFTER_DAYS = 90;
/** Cited numbers are trusted for older invoices too. */
export const CITED_AFTER_DAYS = 365;
/** Subset-sum search limits. */
export const SUM_MAX_CANDIDATES = 20;
export const SUM_MAX_NODES = 20_000;

export type SupplierMatchSignal = "cited" | "exact" | "sum" | "fifo" | "manual";
export type SupplierAllocationStatus = "suggested" | "confirmed" | "rejected";

export interface SmPayment {
  id: string;
  /** Counted amount in MDL (refunds deducted). */
  amount: number;
  date: Date;
  purpose: string | null;
  kind: "bank" | "card";
  /** Bank document number or card merchant. */
  document: string;
}

export interface SmInvoice {
  id: string;
  seria: string;
  number: string;
  total: number;
  issueDate: Date | null;
  /** B/f receipt not absorbed by a card payment: paid on the spot. */
  paidOnSpot: boolean;
}

export interface SmAllocation {
  paymentId: string;
  invoiceId: string;
  amount: number;
  status: SupplierAllocationStatus;
  /** Confirmed link that no longer holds (payment re-attributed / invoice not live): counts nowhere. */
  stale?: boolean;
}

export interface SmSuggestion {
  paymentId: string;
  invoiceId: string;
  /** MDL. */
  amount: number;
  confidence: number;
  signal: SupplierMatchSignal;
  reason: string;
  /** Safe to confirm without a human (cited + exact amount, or unique exact amount). */
  autoConfirm: boolean;
}

const cents = (n: number): number => Math.round(n * 100);
const mdl = (c: number): number => c / 100;

export const invoiceDocument = (inv: Pick<SmInvoice, "seria" | "number">): string =>
  `${inv.seria}${inv.number}`;

function stripZeros(s: string): string {
  const t = s.replace(/^0+/, "");
  return t || "0";
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

export interface CitedRefs {
  /** Purpose uppercased with all whitespace removed (for SERIA+NUMBER lookups). */
  compact: string;
  /** Digit runs (leading zeros stripped), ≥ 5 digits — cited without a keyword. */
  longNumbers: Set<string>;
  /** Numbers right after a keyword (factura, f-ra, cont, inv, №…), any length ≥ 2. */
  keywordNumbers: Set<string>;
}

/**
 * Keyword + number. Keywords need a non-letter before them (no FF inside
 * OFFICE / TARIFF); CONT is not CONTRACT; a bare «NR» is not a keyword (it
 * only counts right after one, «cont nr. 15»), so «contract nr. 15» cites
 * nothing.
 */
const KEYWORD_RE =
  /(?<![A-Z])(?:E-?FACTURA|FACTURII|FACTURILE|FACTURA|FACTURI|FACT|F-RA|F\/RA|FRA|FF|CONTUL|CONT(?!RACT|R\.)|INVOICE|INV(?!EST)|N°|№)\.?\s*(?:NR\.?\s*|N\s*)?[:#]?\s*([A-Z]{0,5})\s*(\d[\d\s]*\d|\d)(?!\d)/g;

/** IBANs (MD24AG000…): their check digits / account digits are not invoice numbers. */
const IBAN_RE = /(?<![A-Z0-9])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![A-Z0-9])/g;
/** Dates (10.11.2026, 2026-11-10, 02.10): masked so their digits never glue to a number. */
const DATE_RE = /(?<!\d)(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}-\d{2}-\d{2})(?![\d])/g;

/** Uppercased, accents folded, IBANs dropped, dates masked. */
function purposeText(purpose: string | null | undefined): string {
  return fold(purpose ?? "").replace(IBAN_RE, " ").replace(DATE_RE, " ~ ");
}

/** Invoice references in a payment purpose, normalized for comparison. */
export function extractCitedRefs(purpose: string | null | undefined): CitedRefs {
  const text = purposeText(purpose);
  const compact = text.replace(/\s+/g, "");
  const longNumbers = new Set<string>();
  const keywordNumbers = new Set<string>();
  // Raw digit runs and runs with wrap-spaces collapsed ("640 800").
  const variants = [text, text.replace(/(\d)\s+(?=\d)/g, "$1")];
  for (const v of variants) {
    for (const m of v.matchAll(/\d+/g)) {
      const n = stripZeros(m[0]);
      if (n.length >= 5) longNumbers.add(n);
    }
  }
  for (const m of text.matchAll(KEYWORD_RE)) {
    const digits = m[2]!.replace(/\s+/g, "");
    const n = stripZeros(digits);
    if (n.length >= 2 && n.length <= 12) keywordNumbers.add(n);
  }
  return { compact, longNumbers, keywordNumbers };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the purpose cites this invoice (series + number, long number, or keyword + number). */
export function isInvoiceCited(inv: Pick<SmInvoice, "seria" | "number">, refs: CitedRefs): boolean {
  const seria = fold(inv.seria).replace(/[^A-Z0-9]/g, "");
  const number = inv.number.replace(/\s+/g, "");
  const stripped = stripZeros(number);
  if (seria && number && new RegExp(`${escapeRe(seria)}${escapeRe(number)}(?!\\d)`).test(refs.compact)) return true;
  if (seria && stripped.length >= 3 && new RegExp(`${escapeRe(seria)}0*${escapeRe(stripped)}(?!\\d)`).test(refs.compact)) {
    return true;
  }
  if (stripped.length >= 5 && refs.longNumbers.has(stripped)) return true;
  return stripped.length >= 2 && refs.keywordNumbers.has(stripped);
}

function inWindow(inv: SmInvoice, pay: SmPayment, afterDays: number): boolean {
  if (!inv.issueDate) return true;
  const t = inv.issueDate.getTime();
  const p = pay.date.getTime();
  return p >= t - WINDOW_BEFORE_DAYS * DAY_MS && p <= t + afterDays * DAY_MS;
}

/**
 * Credit notes (negative totals, not B/f) netted against the oldest open
 * invoices of the same supplier: open = total − confirmed links. Returns the
 * offset per positive invoice in MDL. Same rule for the engine, the card,
 * the Закупки pill and the «Не оплачено» check.
 */
export function creditNoteOffsets(
  invoices: ReadonlyArray<Pick<SmInvoice, "id" | "total" | "issueDate" | "paidOnSpot">>,
  paidByInvoice: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  let credit = 0;
  for (const inv of invoices) if (!inv.paidOnSpot && cents(inv.total) < 0) credit -= cents(inv.total);
  if (credit <= 0) return out;
  const open = invoices
    .filter((inv) => !inv.paidOnSpot && cents(inv.total) > 0)
    .sort(
      (a, b) =>
        (a.issueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.issueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    );
  for (const inv of open) {
    if (credit <= 0) break;
    const left = cents(inv.total) - cents(paidByInvoice.get(inv.id) ?? 0);
    if (left <= 0) continue;
    const take = Math.min(left, credit);
    credit -= take;
    out.set(inv.id, mdl(take));
  }
  return out;
}

const byDate = (a: SmInvoice, b: SmInvoice): number =>
  (a.issueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.issueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
  a.number.localeCompare(b.number);

/**
 * Finds 2..5 amounts (indices into `values`, kept in order) summing to
 * `target`; DFS in array order so older invoices win; stops after `maxNodes`.
 */
export function findSubsetSum(
  values: readonly number[],
  target: number,
  opts: { min?: number; max?: number; maxNodes?: number } = {},
): number[] | null {
  const min = opts.min ?? 2;
  const max = opts.max ?? 5;
  let budget = opts.maxNodes ?? SUM_MAX_NODES;
  const pick: number[] = [];
  let found: number[] | null = null;
  const dfs = (start: number, left: number): void => {
    if (found || budget <= 0) return;
    for (let i = start; i < values.length; i++) {
      if (--budget <= 0 || found) return;
      const v = values[i]!;
      if (v <= 0 || v > left) continue;
      pick.push(i);
      if (v === left) {
        if (pick.length >= min) {
          found = [...pick];
          return;
        }
      } else if (pick.length < max) {
        dfs(i + 1, left - v);
      }
      pick.pop();
    }
  };
  dfs(0, target);
  return found;
}

/** Fresh suggestions for one supplier. `allocations` = existing confirmed / rejected links (suggested ones are ignored). */
export function suggestSupplierMatches(input: {
  payments: readonly SmPayment[];
  invoices: readonly SmInvoice[];
  allocations: readonly SmAllocation[];
}): SmSuggestion[] {
  const payLeft = new Map<string, number>();
  const payFull = new Map<string, number>();
  const invLeft = new Map<string, number>();
  const taken = new Set<string>();
  const pair = (p: string, i: string) => `${p}|${i}`;

  for (const p of input.payments) {
    const c = Math.max(0, cents(p.amount));
    payLeft.set(p.id, c);
    payFull.set(p.id, c);
  }
  for (const inv of input.invoices) invLeft.set(inv.id, inv.paidOnSpot ? 0 : Math.max(0, cents(inv.total)));
  const paidByInvoice = new Map<string, number>();
  for (const a of input.allocations) {
    if (a.status === "suggested" || a.stale) continue;
    taken.add(pair(a.paymentId, a.invoiceId));
    if (a.status !== "confirmed") continue;
    const c = cents(a.amount);
    paidByInvoice.set(a.invoiceId, mdl(cents(paidByInvoice.get(a.invoiceId) ?? 0) + c));
    if (payLeft.has(a.paymentId)) payLeft.set(a.paymentId, Math.max(0, payLeft.get(a.paymentId)! - c));
    if (invLeft.has(a.invoiceId)) invLeft.set(a.invoiceId, Math.max(0, invLeft.get(a.invoiceId)! - c));
  }
  for (const [id, off] of creditNoteOffsets(input.invoices, paidByInvoice)) {
    invLeft.set(id, Math.max(0, (invLeft.get(id) ?? 0) - cents(off)));
  }

  const payments = [...input.payments].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id),
  );
  const invoices = [...input.invoices].sort(byDate);
  const out: SmSuggestion[] = [];

  const open = (inv: SmInvoice, p: SmPayment): boolean =>
    (invLeft.get(inv.id) ?? 0) > 0 && !taken.has(pair(p.id, inv.id));
  const untouched = (p: SmPayment): boolean =>
    (payLeft.get(p.id) ?? 0) > 0 && payLeft.get(p.id) === payFull.get(p.id);

  const push = (
    p: SmPayment,
    inv: SmInvoice,
    amount: number,
    s: Omit<SmSuggestion, "paymentId" | "invoiceId" | "amount">,
  ) => {
    if (amount <= 0) return;
    payLeft.set(p.id, payLeft.get(p.id)! - amount);
    invLeft.set(inv.id, invLeft.get(inv.id)! - amount);
    taken.add(pair(p.id, inv.id));
    out.push({ paymentId: p.id, invoiceId: inv.id, amount: mdl(amount), ...s });
  };

  // 1. Cited numbers.
  for (const p of payments) {
    if ((payLeft.get(p.id) ?? 0) <= 0) continue;
    const refs = extractCitedRefs(p.purpose);
    if (refs.compact.length === 0) continue;
    const cited = invoices.filter(
      (inv) => open(inv, p) && inWindow(inv, p, CITED_AFTER_DAYS) && isInvoiceCited(inv, refs),
    );
    if (cited.length === 0) continue;
    const sumOpen = cited.reduce((s, inv) => s + invLeft.get(inv.id)!, 0);
    const exact = sumOpen === payLeft.get(p.id);
    for (const inv of cited) {
      const left = payLeft.get(p.id)!;
      if (left <= 0) break;
      const need = invLeft.get(inv.id)!;
      const amount = Math.min(left, need);
      const confidence = exact ? (cited.length === 1 ? 100 : 95) : amount === need ? 80 : 70;
      push(p, inv, amount, {
        confidence,
        signal: "cited",
        reason: `Номер ${invoiceDocument(inv)} указан в назначении платежа${exact ? "; сумма совпадает" : ""}`,
        autoConfirm: exact,
      });
    }
  }

  // 2. Exact amount of one open invoice in the window.
  for (const p of payments) {
    if (!untouched(p)) continue;
    const want = payLeft.get(p.id)!;
    const hits = invoices.filter(
      (inv) => open(inv, p) && invLeft.get(inv.id) === want && inWindow(inv, p, WINDOW_AFTER_DAYS),
    );
    if (hits.length === 0) continue;
    const inv = hits[0]!;
    if (hits.length === 1) {
      const rivals = payments.filter(
        (q) => q.id !== p.id && untouched(q) && payLeft.get(q.id) === want && inWindow(inv, q, WINDOW_AFTER_DAYS),
      ).length;
      const unique = rivals === 0;
      push(p, inv, want, {
        confidence: unique ? 90 : 75,
        signal: "exact",
        reason: unique
          ? `Сумма совпадает с фактурой ${invoiceDocument(inv)}, единственной в окне −${WINDOW_BEFORE_DAYS}…+${WINDOW_AFTER_DAYS} дней`
          : `Сумма совпадает с фактурой ${invoiceDocument(inv)}, но платежей такой суммы несколько`,
        autoConfirm: unique,
      });
    } else {
      push(p, inv, want, {
        confidence: 65,
        signal: "exact",
        reason: `Сумма совпадает; таких фактур ${hits.length} — выбрана самая ранняя ${invoiceDocument(inv)}`,
        autoConfirm: false,
      });
    }
  }

  // 3. Sum of 2–5 open invoices.
  for (const p of payments) {
    if (!untouched(p)) continue;
    const want = payLeft.get(p.id)!;
    const cands = invoices
      .filter((inv) => open(inv, p) && invLeft.get(inv.id)! < want && inWindow(inv, p, WINDOW_AFTER_DAYS))
      .slice(0, SUM_MAX_CANDIDATES);
    if (cands.length < 2) continue;
    const idx = findSubsetSum(
      cands.map((inv) => invLeft.get(inv.id)!),
      want,
    );
    if (!idx) continue;
    const docs = idx.map((i) => invoiceDocument(cands[i]!));
    for (const i of idx) {
      const inv = cands[i]!;
      push(p, inv, invLeft.get(inv.id)!, {
        confidence: 80,
        signal: "sum",
        reason: `Платёж равен сумме ${idx.length} фактур: ${docs.join(", ")}`,
        autoConfirm: false,
      });
    }
  }

  // 4. FIFO remainder onto the oldest open invoices issued by the payment date (+ prepayment days).
  for (const p of payments) {
    if ((payLeft.get(p.id) ?? 0) <= 0) continue;
    const limit = p.date.getTime() + WINDOW_BEFORE_DAYS * DAY_MS;
    for (const inv of invoices) {
      const left = payLeft.get(p.id)!;
      if (left <= 0) break;
      if (!open(inv, p)) continue;
      if (inv.issueDate && inv.issueDate.getTime() > limit) continue;
      const need = invLeft.get(inv.id)!;
      const amount = Math.min(left, need);
      push(p, inv, amount, {
        confidence: amount === need ? 45 : 35,
        signal: "fifo",
        reason:
          amount === need
            ? `По очереди: самая ранняя неоплаченная фактура ${invoiceDocument(inv)}`
            : `По очереди: часть платежа на фактуру ${invoiceDocument(inv)}`,
        autoConfirm: false,
      });
    }
  }

  return out;
}

export type InvoicePaymentStatus = "paid" | "partial" | "unpaid" | "receipt" | "credit";

/**
 * Per-invoice status from confirmed links + credit-note offset (B/f on the
 * spot wins). A negative invoice is a credit note: neutral «Сторно».
 */
export function invoicePaymentStatus(
  total: number,
  confirmedPaid: number,
  paidOnSpot: boolean,
  creditOffset = 0,
): InvoicePaymentStatus {
  const t = cents(total);
  if (t < 0) return "credit";
  if (paidOnSpot) return "receipt";
  const p = cents(confirmedPaid) + cents(creditOffset);
  if (t === 0 || p >= t) return "paid";
  if (p > 0) return "partial";
  return "unpaid";
}

/**
 * Caps a manual / confirmed amount: never above what is left on the payment
 * and on the invoice (both excluding this very pair). MDL in, MDL out.
 */
export function capAllocation(input: {
  requested: number;
  paymentAmount: number;
  paymentAllocatedElsewhere: number;
  invoiceTotal: number;
  invoiceAllocatedElsewhere: number;
}): number {
  const room = Math.min(
    cents(input.paymentAmount) - cents(input.paymentAllocatedElsewhere),
    cents(input.invoiceTotal) - cents(input.invoiceAllocatedElsewhere),
  );
  const c = Math.min(cents(input.requested), room);
  return c > 0 ? mdl(c) : 0;
}
