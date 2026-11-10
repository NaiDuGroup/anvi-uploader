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
  if (!s.includes("CUMPARATURI")) return null;

  const dateM = /DIN(\d{2})\.(\d{2})\.(\d{4})\//.exec(s);
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
}

const cents = (n: number): number => Math.round(n * 100);

/** IDNOs whose normalized name contains / is contained in the key (shorter ≥ 5 chars). */
export function matchByName(
  merchantKey: string,
  names: ReadonlyArray<{ idno: string; key: string }>,
): string | null {
  const hits = new Set<string>();
  for (const n of names) {
    if (!n.key) continue;
    const shorter = Math.min(n.key.length, merchantKey.length);
    if (shorter < 5) continue;
    if (n.key.includes(merchantKey) || merchantKey.includes(n.key)) hits.add(n.idno);
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

/** Exactly one invoice of that amount (±0.01) issued −5..+30 days around the card date. */
export function matchByAmount(
  amount: number,
  date: Date,
  invoices: readonly CardInvoiceCandidate[],
): string | null {
  const c = cents(amount);
  const lo = date.getTime() - 5 * DAY_MS;
  const hi = date.getTime() + 30 * DAY_MS;
  const hits = invoices.filter(
    (inv) =>
      inv.issueDate &&
      Math.abs(cents(inv.totalAmount) - c) <= 1 &&
      inv.issueDate.getTime() >= lo &&
      inv.issueDate.getTime() <= hi,
  );
  return hits.length === 1 ? hits[0]!.supplierIdno : null;
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
  const invoices = input.invoices.filter((i) => !excluded.has(i.supplierIdno));
  const byNameCache = new Map<string, string | null>();

  const out: CardPurchase[] = [];
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
    const byAmount = matchByAmount(d.amount, parsed.purchaseDate, invoices);
    out.push({
      ...base,
      idno: byAmount,
      source: byAmount ? "amount" : null,
      ignored: false,
    });
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
