/**
 * «Взаиморасчёты»: company-card purchases. MAIB books them as debits to the
 * bank itself ("Cumparaturi la Comercianti din DD.MM.YYYY/<card> la <MERCHANT>
 * MCC…"), so without this they vanish into the bank bucket. Pure: parsing,
 * merchant normalization, attribution to a supplier IDNO and the B/f receipt
 * de-duplication all work on plain data.
 */

const DAY_MS = 86_400_000;

export interface ParsedCardPurchase {
  /** Card date from the purpose (UTC midnight). */
  purchaseDate: Date;
  /** Merchant as printed (whitespace collapsed; TXT extracts keep their odd splits). */
  merchantRaw: string;
  /** Uppercase alphanumerics without legal forms / trailing city — grouping and alias key. */
  merchantKey: string;
}

/** Legal-form words dropped from merchant / supplier names. */
const LEGAL_WORDS = new Set([
  "SRL",
  "SA",
  "ICS",
  "SC",
  "II",
  "IM",
  "IP",
  "IS",
  "FPC",
  "GT",
  "CC",
  "LTD",
  "LLC",
  "SRLS",
]);

/** Trailing location words in card merchant names (stripped repeatedly from the key end). */
const CITY_SUFFIXES = [
  "CHISINAU",
  "KISHINEV",
  "BALTI",
  "ORHEI",
  "UNGHENI",
  "CAHUL",
  "COMRAT",
  "SOROCA",
  "STAUCENI",
  "IALOVENI",
  "DURLESTI",
  "CODRU",
  "MOLDOVA",
  "MDA",
];

/** Legal forms that may survive at the key end when the TXT split the word ("S RL"). */
const LEGAL_SUFFIXES = ["SRL", "ICS"];

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Same normalization for card merchants and supplier names: uppercase, no
 * diacritics, legal forms out, then everything but A–Z/0–9 removed, then
 * trailing city words / numbers / split legal forms stripped.
 */
export function normalizeMerchantName(raw: string): string {
  const upper = stripDiacritics(raw).toUpperCase().replace(/[."'`«»“”„]/g, "");
  const words = upper.split(/[^A-Z0-9]+/).filter((w) => w && !LEGAL_WORDS.has(w));
  let key = words.join("");
  for (let guard = 0; guard < 10; guard++) {
    const before = key;
    for (const suffix of [...CITY_SUFFIXES, ...LEGAL_SUFFIXES]) {
      if (key.length > suffix.length + 2 && key.endsWith(suffix)) {
        key = key.slice(0, -suffix.length);
      }
    }
    const digits = key.match(/\d+$/);
    if (digits && key.length - digits[0].length >= 3) key = key.slice(0, -digits[0].length);
    if (key === before) break;
  }
  return key;
}

/**
 * Parses a card purchase purpose. TXT extracts split words at random
 * ("Comer cianti", "202 5", "CHISIN AU"), so matching runs on a copy with
 * all whitespace removed and maps positions back to the original text.
 */
export function parseCardPurchase(purpose: string | null | undefined): ParsedCardPurchase | null {
  if (!purpose) return null;
  const source = stripDiacritics(purpose);
  const chars: string[] = [];
  const pos: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (/\s/.test(source[i]!)) continue;
    chars.push(source[i]!.toUpperCase());
    pos.push(i);
  }
  const s = chars.join("");
  // Anchored: the purpose must START with «Cumparaturi la Comercianti din
  // DD.MM.YYYY/» — a reversal / fee row that merely quotes a purchase
  // («Anulare Cumparaturi…», «Comision pentru Cumparaturi…») is not one.
  const dateM = /^[^A-Z0-9]*CUMPARATURILACOMERCIANTIDIN(\d{2})\.(\d{2})\.(\d{4})\//.exec(s);
  if (!dateM) return null;
  const dd = Number(dateM[1]);
  const mm = Number(dateM[2]);
  const yyyy = Number(dateM[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const purchaseDate = new Date(Date.UTC(yyyy, mm - 1, dd));

  const afterDate = dateM.index + dateM[0].length;
  const cardM = /^[0-9*X]+LA/.exec(s.slice(afterDate));
  if (!cardM) return null;
  const start = afterDate + cardM[0].length;
  const rest = s.slice(start);
  const endM = /MCC\d|\/SUMA|\/|\d+(?:[.,]\d+)?\.?MDL\b/.exec(rest);
  const end = start + (endM ? endM.index : rest.length);
  if (end <= start) return null;

  const rawStart = pos[start]!;
  const rawEnd = pos[end - 1]! + 1;
  const merchantRaw = purpose
    .slice(rawStart, rawEnd)
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  const merchantKey = normalizeMerchantName(merchantRaw);
  if (!merchantRaw || !merchantKey) return null;
  return { purchaseDate, merchantRaw, merchantKey };
}

/* ------------------------------------------------------------------ */
/* Attribution                                                         */
/* ------------------------------------------------------------------ */

export type CardAttributionSource = "alias" | "name" | "amount";

export interface CardDebit {
  id: string;
  amount: number;
  bookingDate: Date;
  purpose: string | null;
}

export interface CardPurchase extends ParsedCardPurchase {
  debitId: string;
  amount: number;
  bookingDate: Date;
  purpose: string | null;
  /** Supplier IDNO it is paid to; null = stays a bank row. */
  idno: string | null;
  source: CardAttributionSource | null;
  /** Alias says «не поставщик». */
  ignored: boolean;
}

export interface CardAlias {
  merchantKey: string;
  idno: string | null;
}

export interface CardNameCandidate {
  idno: string;
  name: string;
}

export interface CardInvoiceCandidate {
  supplierIdno: string;
  totalAmount: number;
  issueDate: Date | null;
  /** Already paid another way (bank allocation / B/f): used only when nothing else fits. */
  settled?: boolean;
}

const cents = (n: number): number => Math.round(n * 100);

/** Substring match only for long / proportionate keys (else a generic word swallows shops). */
const MIN_SUBSTRING_KEY = 8;
const MIN_SUBSTRING_SHARE = 0.6;

/**
 * Keys match when equal; one containing the other counts only when the
 * shorter key has ≥ 8 chars or is ≥ 60 % of the longer one («MAGAZIN» is not
 * «MAGAZINULUNIVERSAL», «PRINT» is not «PRINTERRASHOP»). Shorter < 5 never
 * matches. Exactly one IDNO must hit.
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  if (shorter < 5) return false;
  if (a === b) return true;
  if (shorter < MIN_SUBSTRING_KEY && shorter < MIN_SUBSTRING_SHARE * longer) return false;
  return a.includes(b) || b.includes(a);
}

export function matchByName(
  merchantKey: string,
  names: ReadonlyArray<{ idno: string; key: string }>,
): string | null {
  const hits = new Set<string>();
  for (const n of names) {
    if (namesMatch(n.key, merchantKey)) hits.add(n.idno);
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

/** Invoices of that amount (±0.01) issued −5..+30 days around the card date. */
function amountHits<T extends CardInvoiceCandidate>(amount: number, date: Date, invoices: readonly T[]): T[] {
  const c = cents(amount);
  const lo = date.getTime() - 5 * DAY_MS;
  const hi = date.getTime() + 30 * DAY_MS;
  return invoices.filter(
    (inv) =>
      inv.issueDate &&
      Math.abs(cents(inv.totalAmount) - c) <= 1 &&
      inv.issueDate.getTime() >= lo &&
      inv.issueDate.getTime() <= hi,
  );
}

/**
 * Picks the invoice a card payment of `amount` on `date` pays: among the
 * same-amount invoices in the window, unsettled ones win over settled ones;
 * all remaining hits must belong to ONE supplier (several invoices of the
 * same supplier are fine — the closest-dated one is taken). Null when none
 * or several suppliers.
 */
export function pickInvoiceByAmount<T extends CardInvoiceCandidate>(
  amount: number,
  date: Date,
  invoices: readonly T[],
): T | null {
  const hits = amountHits(amount, date, invoices);
  const open = hits.filter((h) => !h.settled);
  const pool = open.length > 0 ? open : hits;
  if (pool.length === 0) return null;
  if (new Set(pool.map((h) => h.supplierIdno)).size !== 1) return null;
  let best = pool[0]!;
  for (const h of pool) {
    const gap = Math.abs(h.issueDate!.getTime() - date.getTime());
    if (gap < Math.abs(best.issueDate!.getTime() - date.getTime())) best = h;
  }
  return best;
}

/** Supplier of the one (or one supplier's) same-amount invoice around the card date. */
export function matchByAmount(
  amount: number,
  date: Date,
  invoices: readonly CardInvoiceCandidate[],
): string | null {
  return pickInvoiceByAmount(amount, date, invoices)?.supplierIdno ?? null;
}

/**
 * Alias > unique name match > unique same-amount invoice. Debits that are not
 * card purchases (fees, cash withdrawals…) are skipped entirely.
 */
export function attributeCardPurchases(input: {
  debits: readonly CardDebit[];
  aliases: readonly CardAlias[];
  names: readonly CardNameCandidate[];
  invoices: readonly CardInvoiceCandidate[];
  /** IDNOs never chosen automatically (own, bank, taxes…). */
  excludedIdnos?: ReadonlySet<string>;
}): CardPurchase[] {
  const aliasByKey = new Map(input.aliases.map((a) => [a.merchantKey, a]));
  const excluded = input.excludedIdnos ?? new Set<string>();
  const nameKeys: Array<{ idno: string; key: string }> = [];
  const seen = new Set<string>();
  for (const n of input.names) {
    if (excluded.has(n.idno)) continue;
    const key = normalizeMerchantName(n.name);
    const tag = `${n.idno}|${key}`;
    if (!key || seen.has(tag)) continue;
    seen.add(tag);
    nameKeys.push({ idno: n.idno, key });
  }
  // Each invoice can absorb one card purchase: matched invoices leave the pool.
  const invoicePool = input.invoices.filter((i) => !excluded.has(i.supplierIdno));
  const byNameCache = new Map<string, string | null>();

  const out: CardPurchase[] = [];
  const pendingAmount: CardPurchase[] = [];
  for (const d of input.debits) {
    const parsed = parseCardPurchase(d.purpose);
    if (!parsed) continue;
    const base = {
      ...parsed,
      debitId: d.id,
      amount: d.amount,
      bookingDate: d.bookingDate,
      purpose: d.purpose,
    };
    const alias = aliasByKey.get(parsed.merchantKey);
    if (alias) {
      out.push({
        ...base,
        idno: alias.idno,
        source: alias.idno ? "alias" : null,
        ignored: !alias.idno,
      });
      continue;
    }
    let byName = byNameCache.get(parsed.merchantKey);
    if (byName === undefined) {
      byName = matchByName(parsed.merchantKey, nameKeys);
      byNameCache.set(parsed.merchantKey, byName);
    }
    if (byName) {
      out.push({ ...base, idno: byName, source: "name", ignored: false });
      continue;
    }
    const pending: CardPurchase = { ...base, idno: null, source: null, ignored: false };
    out.push(pending);
    pendingAmount.push(pending);
  }

  // Amount match last, oldest card first, so earlier purchases claim invoices first.
  pendingAmount.sort(
    (a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime() || a.debitId.localeCompare(b.debitId),
  );
  let pool = invoicePool;
  for (const card of pendingAmount) {
    const inv = pickInvoiceByAmount(card.amount, card.purchaseDate, pool);
    if (!inv) continue;
    card.idno = inv.supplierIdno;
    card.source = "amount";
    pool = pool.filter((i) => i !== inv);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* B/f receipts vs card payments                                       */
/* ------------------------------------------------------------------ */

export interface ReceiptCredit {
  /** Purchase invoice document (seria+number). */
  document: string;
  supplierIdno: string;
  amount: number;
  /** Receipt date (falls back to the invoice date). */
  date: Date;
}

export interface CardPaymentRef {
  debitId: string;
  idno: string;
  amount: number;
  date: Date;
}

/**
 * A supplier invoice paid by B/f at the counter counts as paid in full —
 * unless an attributed card purchase to the same IDNO with the same amount
 * (±0.01) within ±15 days already covers it (paid by card at the shop: the
 * bank row and the B/f are one payment). Each card payment absorbs at most
 * one receipt; the closest date wins. Returns the receipts to keep.
 */
export function receiptsNotCoveredByCard<R extends ReceiptCredit>(
  receipts: readonly R[],
  cards: readonly CardPaymentRef[],
): R[] {
  const used = new Set<string>();
  const kept: R[] = [];
  const sorted = [...receipts].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const r of sorted) {
    const rc = cents(r.amount);
    let best: CardPaymentRef | null = null;
    let bestGap = Infinity;
    for (const c of cards) {
      if (used.has(c.debitId) || c.idno !== r.supplierIdno) continue;
      if (Math.abs(cents(c.amount) - rc) > 1) continue;
      const gap = Math.abs(c.date.getTime() - r.date.getTime());
      if (gap > 15 * DAY_MS) continue;
      if (gap < bestGap) {
        best = c;
        bestGap = gap;
      }
    }
    if (best) used.add(best.debitId);
    else kept.push(r);
  }
  return kept;
}
