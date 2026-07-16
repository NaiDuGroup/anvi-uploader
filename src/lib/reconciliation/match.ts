/**
 * Pure matching helpers for bank-payment reconciliation. No DB access here so
 * these can be unit-tested in isolation; the orchestrator in `autoMatch.ts`
 * feeds them candidates loaded from the database.
 */

export interface InvoiceRefs {
  /** e-Factura tokens like "EBJ000662654" (series + number, spaces removed). */
  fiscalTokens: string[];
  /**
   * Paper / pre-e-Factura fiscal tokens like "AAQ4557640" cited in the purpose
   * but not issued through SFS e-Factura.
   */
  paperTokens: string[];
  /** Numeric "Cont / Invoice Nr." references (our own invoice sequence numbers). */
  contNumbers: number[];
}

export type FiscalRefKind = "efactura" | "paper" | "other";

/**
 * Series codes that look like 3 letters + digits after bank-wrap normalization
 * but are Romanian noise (dates, TVA, etc.), not invoice series.
 */
const PAPER_SERIES_DENYLIST = new Set([
  "DIN",
  "TVA",
  "SUMA",
  "DATA",
  "CONT",
  "NUM",
  "INC",
  "VAL",
  "MDL",
  "RON",
  "EUR",
  "USD",
]);

/**
 * Confidence at/above which a *specific-invoice* auto-match is applied without
 * human review (number cited or exact amount). IDNO-only matches (40/60) are
 * auto-applied separately via FIFO distribution across the buyer's open
 * invoices — see `runAutoMatch`.
 */
export const AUTO_APPLY_THRESHOLD = 60;

/**
 * Collapses bank-statement wrap artifacts inside fiscal tokens:
 *  - spaces inside digit runs (`AAQ4557 640` → `AAQ4557640`)
 *  - spaces between series letters and digits (`EBJ 000662654` → `EBJ000662654`)
 */
export function normalizePurposeForFiscalTokens(purpose: string): string {
  let text = purpose.toUpperCase();
  let prev = "";
  while (text !== prev) {
    prev = text;
    text = text.replace(/(\d)\s+(\d)/g, "$1$2");
  }
  text = text.replace(/([A-Z]{2,5})\s+(\d)/g, "$1$2");
  return text;
}

/**
 * Classifies a series+number pair extracted from a payment purpose.
 *
 * e-Factura (this supplier): `E[A-Z]{2}` or `RP` with ≥6 digits (usually 9, zero-padded).
 * Paper / offline FF: exactly 3 letters, 6–8 digits, no leading zero, not denylisted.
 */
export function classifyFiscalRef(seria: string, number: string): FiscalRefKind {
  const ser = seria.toUpperCase();
  const num = number;
  if (/^E[A-Z]{2}$/.test(ser) || ser === "RP") {
    return num.length >= 6 ? "efactura" : "other";
  }
  if (
    ser.length === 3 &&
    !PAPER_SERIES_DENYLIST.has(ser) &&
    num.length >= 6 &&
    num.length <= 8 &&
    !num.startsWith("0")
  ) {
    return "paper";
  }
  return "other";
}

/** Splits a fiscal token like "EBJ000662654" / "AAQ4557640" into series + number. */
export function splitFiscalToken(token: string): { seria: string; number: string } | null {
  const m = token.match(/^([A-Za-z]{2,5})(\d{4,})$/);
  if (!m) return null;
  return { seria: m[1].toUpperCase(), number: m[2] };
}

/**
 * Extracts invoice references from a free-text bank payment purpose.
 *
 * Real examples from MAIB statements:
 *  - "...CONF.FACTURA EBJ 000662654 DIN 29/06/2026"  -> fiscal EBJ000662654
 *  - "conform e-factura Nr.EBJ000872384"             -> fiscal EBJ000872384
 *  - "conf fact.RP000014415 din 02.07.2026"          -> fiscal RP000014415
 *  - "conform FFAAQ455764 0 din 28.02.2023"          -> paper AAQ4557640
 *  - "conffacturiiAAQ4557 640"                       -> paper AAQ4557640
 *  - "Cont de plata/Invoice Nr.1 din 13-07-2026"     -> contNumber 1
 */
export function extractInvoiceRefs(purpose: string | null | undefined): InvoiceRefs {
  const fiscalTokens = new Set<string>();
  const paperTokens = new Set<string>();
  const contNumbers = new Set<number>();
  if (!purpose) return { fiscalTokens: [], paperTokens: [], contNumbers: [] };

  const text = normalizePurposeForFiscalTokens(purpose);

  // 2–5 letters immediately followed by ≥6 digits (after wrap normalization).
  // Bank text often glues words to the series (`facturiiAAQ4557640`), so we try
  // suffixes of the letter run and prefer e-Factura, then paper.
  const fiscalRe = /([A-Z]{2,5})(\d{6,})/g;
  let m: RegExpExecArray | null;
  while ((m = fiscalRe.exec(text)) !== null) {
    let rawSer = m[1];
    const num = m[2];
    // Glued "FF" = factură fiscală abbreviation before a real series (FFAAQ…).
    if (rawSer.startsWith("FF") && rawSer.length >= 5) {
      rawSer = rawSer.slice(2);
    }

    let best: { ser: string; kind: FiscalRefKind } | null = null;
    for (let len = Math.min(5, rawSer.length); len >= 2; len--) {
      const ser = rawSer.slice(-len);
      const kind = classifyFiscalRef(ser, num);
      if (kind === "efactura") {
        best = { ser, kind };
        break;
      }
      if (kind === "paper" && best?.kind !== "paper") {
        best = { ser, kind };
      }
    }

    if (best?.kind === "efactura") fiscalTokens.add(`${best.ser}${num}`);
    else if (best?.kind === "paper") paperTokens.add(`${best.ser}${num}`);
  }

  // Cont numbers: "Nr." / "Nr " / "cont ... N" followed by short digits NOT
  // part of a fiscal token (i.e. not preceded by letters).
  const contRe = /\bNR\.?\s*(\d{1,6})\b/g;
  while ((m = contRe.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 4), m.index);
    // Skip "Nr.EBJ000..." (letters between Nr and digits handled by fiscalRe).
    if (/[A-Z]$/.test(before.replace(/NR\.?\s*$/, ""))) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) contNumbers.add(n);
  }

  return {
    fiscalTokens: [...fiscalTokens],
    paperTokens: [...paperTokens],
    contNumbers: [...contNumbers],
  };
}

/**
 * True when purpose already names a paper/fiscal document — auto-match must
 * not FIFO the payment onto unrelated open e-Factura of the same buyer.
 */
export function shouldSkipFifoForPurpose(
  purpose: string | null | undefined,
): boolean {
  const refs = extractInvoiceRefs(purpose);
  return refs.paperTokens.length > 0 || refs.fiscalTokens.length > 0;
}

/**
 * Prefills the "historical / paper FF" document label from a bank purpose
 * (paper token, e-Factura token, Cont nr.N, or a short purpose snippet).
 */
export function suggestHistoricalDocument(
  purpose: string | null | undefined,
): string {
  const refs = extractInvoiceRefs(purpose);
  if (refs.paperTokens[0]) return refs.paperTokens[0];
  if (refs.fiscalTokens[0]) return refs.fiscalTokens[0];
  if (refs.contNumbers[0] != null) return `nr.${refs.contNumbers[0]}`;
  const snippet = (purpose ?? "").replace(/\s+/g, " ").trim();
  if (!snippet) return "—";
  return snippet.length > 80 ? `${snippet.slice(0, 77)}...` : snippet;
}

export interface MatchSignals {
  /** Invoice was referenced by number (our cont number or a linked fiscal token). */
  numberMatch: boolean;
  /** Payer fiscal code equals the invoice client's IDNO. */
  idnoMatch: boolean;
  /** Transaction amount equals the invoice's outstanding balance. */
  amountExact: boolean;
  /** This client has exactly one open invoice (disambiguates idno-only matches). */
  uniqueOpenForClient: boolean;
}

/** Scores a candidate invoice for a transaction (0..100). */
export function scoreMatch(s: MatchSignals): number {
  if (s.numberMatch && s.amountExact && s.idnoMatch) return 100;
  if (s.numberMatch && s.amountExact) return 95;
  if (s.numberMatch && s.idnoMatch) return 88;
  if (s.idnoMatch && s.amountExact) return 82;
  if (s.numberMatch) return 72;
  if (s.idnoMatch && s.uniqueOpenForClient) return 60;
  if (s.idnoMatch) return 40;
  return 0;
}
