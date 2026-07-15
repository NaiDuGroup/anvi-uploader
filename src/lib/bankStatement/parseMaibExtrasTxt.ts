import { buildBankTxDedupeKey } from "./dedupeKey";
import type {
  NormalizedTransaction,
  ParseOptions,
  ParseWarning,
  ParsedStatement,
} from "./types";

/**
 * MAIB "EXTRAS DIN CONT" plain-text export (fixed-width / multi-line rows).
 * Used for long-period statements the bank will not emit as multi-year CSV.
 *
 * Layout quirks:
 *  - After N/O ≥ 1000 the sequence number and date often glue together
 *    (`232725.02.25` instead of `2327 25.02.25`).
 *  - Counterparty name and payment purpose wrap onto indented continuation lines.
 */

const HEADER_MARK = /EXTRAS\s+DIN\s+CONT/i;
const PERIOD_RE = /pentru\s+(\d{2})\.(\d{2})\.(\d{4})-(\d{2})\.(\d{2})\.(\d{4})/i;
const IBAN_LINE_RE = /Cod\s+IBAN:\s*(MD\d{2}AG\d+)/i;
const OPENING_RE = /SOLD\s+INITIAL\s+LA\s+\d{2}\.\d{2}\.\d{4}\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i;
/** Spaced N/O: `999 25.02.25` or glued when N/O ≥ 1000: `100026.03.24`. */
const TX_START_SPACED_RE = /^(\d{1,5})\s+(\d{2})\.(\d{2})\.(\d{2})\s+(\S+)/;
const TX_START_GLUED_RE = /^(\d{1,4})(\d{2})\.(\d{2})\.(\d{2})\s+(\S+)/;
const MONEY_TAIL_RE = /([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(.*)$/;
const IDNO_RE = /\b(\d{13})\b/;

type TxStartMatch = {
  full: string;
  seq: string;
  dd: string;
  mm: string;
  yy: string;
  token: string;
};

function matchTxStart(line: string): TxStartMatch | null {
  const spaced = TX_START_SPACED_RE.exec(line);
  if (spaced) {
    return {
      full: spaced[0],
      seq: spaced[1],
      dd: spaced[2],
      mm: spaced[3],
      yy: spaced[4],
      token: spaced[5],
    };
  }
  const glued = TX_START_GLUED_RE.exec(line);
  if (glued) {
    return {
      full: glued[0],
      seq: glued[1],
      dd: glued[2],
      mm: glued[3],
      yy: glued[4],
      token: glued[5],
    };
  }
  return null;
}

function parseAmount(raw: string): string | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function parseYyDate(dd: string, mm: string, yy: string): Date {
  const year = 2000 + Number(yy);
  return new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
}

function parseFullDate(dd: string, mm: string, yyyy: string): Date {
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
}

function cleanName(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.replace(/^\(R\)\s*/i, "").replace(/^\(N\)\s*/i, "").replace(/^\(F\)\s*/i, "").trim() || null;
}

function isTxStart(line: string): boolean {
  if (line.startsWith(" ") || line.startsWith("\t")) return false;
  if (/^SOLD\s/i.test(line) || /^L\.S\./i.test(line.trim()) || line.startsWith("---")) {
    return false;
  }
  if (/^Pag\s+\d+/i.test(line.trim())) return false;
  const m = matchTxStart(line);
  if (!m) return false;
  // After the date we expect BIC / short bank codes — not pure prose.
  return /^(AGRNMD|[A-Z]{4}MD|\d{4,})/i.test(m.token);
}

/** Split a continuation line into left (name wrap) / right (purpose wrap). */
function splitContinuation(line: string): { namePart: string; purposePart: string } {
  // Purpose block sits roughly in the right half of the 140-char print line.
  const trimmedEnd = line.replace(/\s+$/, "");
  if (trimmedEnd.length < 90) {
    const t = trimmedEnd.trim();
    // Short left-only wraps are usually name fragments ("UP S.R.L.").
    if (t && !/\s{8,}/.test(trimmedEnd.slice(0, 80))) {
      return { namePart: t, purposePart: "" };
    }
  }
  const left = line.slice(0, 95).trim();
  const right = line.slice(95).trim();
  return { namePart: left, purposePart: right };
}

export function parseMaibExtrasTxt(
  content: string,
  options: ParseOptions = {},
): ParsedStatement {
  const { ourFiscalCode } = options;
  const warnings: ParseWarning[] = [];
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (!lines.some((l) => HEADER_MARK.test(l))) {
    return {
      accountIban: null,
      openingBalance: null,
      periodFrom: null,
      periodTo: null,
      currency: "MDL",
      transactions: [],
      warnings: [{ line: 1, message: "Unrecognized statement format (expected EXTRAS DIN CONT)" }],
    };
  }

  let accountIban: string | null = options.ourIban ?? null;
  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;
  let openingBalance: string | null = null;
  let currency = "MDL";

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const l = lines[i];
    const ibanM = l.match(IBAN_LINE_RE);
    if (ibanM) {
      accountIban = ibanM[1];
      if (/\/([A-Z]{3})/.test(l)) {
        currency = l.match(/\/([A-Z]{3})/)?.[1] ?? currency;
      }
    }
    const perM = l.match(PERIOD_RE);
    if (perM) {
      periodFrom = parseFullDate(perM[1], perM[2], perM[3]);
      periodTo = parseFullDate(perM[4], perM[5], perM[6]);
    }
    const openM = l.match(OPENING_RE);
    if (openM) {
      // Statement prints opening on both debit/credit columns; prefer non-zero.
      openingBalance = parseAmount(openM[2]) !== "0.00" ? parseAmount(openM[2]) : parseAmount(openM[1]);
    }
  }

  const transactions: NormalizedTransaction[] = [];
  const seenKeys = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;
    if (!isTxStart(line)) {
      i += 1;
      continue;
    }

    const startM = matchTxStart(line);
    if (!startM) {
      i += 1;
      continue;
    }
    const bookingDate = parseYyDate(startM.dd, startM.mm, startM.yy);
    const moneyM = MONEY_TAIL_RE.exec(line);
    if (!moneyM) {
      warnings.push({ line: lineNo, message: "Missing debit/credit amounts; row skipped" });
      i += 1;
      continue;
    }

    const debit = parseAmount(moneyM[1]);
    const credit = parseAmount(moneyM[2]);
    if (debit === null || credit === null) {
      warnings.push({ line: lineNo, message: "Invalid amounts; row skipped" });
      i += 1;
      continue;
    }

    const debitN = Number(debit);
    const creditN = Number(credit);
    if (debitN <= 0 && creditN <= 0) {
      warnings.push({ line: lineNo, message: "Zero-amount row; skipped" });
      i += 1;
      continue;
    }
    if (debitN > 0 && creditN > 0) {
      warnings.push({
        line: lineNo,
        message: "Both debit and credit set; using the larger side",
      });
    }

    const direction: "CREDIT" | "DEBIT" =
      creditN > debitN ? "CREDIT" : "DEBIT";
    const amount = direction === "CREDIT" ? credit : debit;

    // Middle of the first line: BIC, account, IDNO, name, doc#, TD
    const mid = line.slice(startM.full.length, moneyM.index);
    const idnoM = mid.match(IDNO_RE);
    let counterpartyIdno = idnoM?.[1] ?? null;
    let counterpartyName: string | null = null;
    let documentNumber: string | null = null;
    let txTypeCode: string | null = null;
    let counterpartyIban: string | null = null;

    const ibanInMid = mid.match(/\b(MD\d{2}AG\d+)\b/);
    if (ibanInMid) counterpartyIban = ibanInMid[1];

    if (idnoM) {
      const afterIdno = mid.slice(idnoM.index! + idnoM[0].length).trim();
      // "... NAME DOC TD" — TD is short int at the end, DOC before it.
      const tail = afterIdno.match(/^(.*?)\s+(\S+)\s+(\d+)\s*$/);
      if (tail) {
        counterpartyName = cleanName(tail[1]);
        documentNumber = tail[2];
        txTypeCode = tail[3];
      } else {
        counterpartyName = cleanName(afterIdno);
      }
    }

    let purpose = moneyM[3].trim();

    // Continuation lines
    let j = i + 1;
    while (j < lines.length) {
      const nxt = lines[j];
      if (isTxStart(nxt)) break;
      if (
        /^SOLD\s/i.test(nxt) ||
        /^\s*L\.S\./i.test(nxt) ||
        nxt.startsWith("---") ||
        /^\s*Pag\s+\d+/i.test(nxt)
      ) {
        break;
      }
      if (!nxt.trim()) {
        j += 1;
        continue;
      }
      if (!nxt.startsWith(" ") && !nxt.startsWith("\t")) break;
      const { namePart, purposePart } = splitContinuation(nxt);
      if (namePart) {
        counterpartyName = cleanName(`${counterpartyName ?? ""} ${namePart}`);
      }
      if (purposePart) {
        purpose = `${purpose} ${purposePart}`.replace(/\s+/g, " ").trim();
      }
      j += 1;
    }

    if (
      ourFiscalCode &&
      (!counterpartyIdno || counterpartyIdno === ourFiscalCode)
    ) {
      // Keep as-is; extras rows only expose one fiscal code column.
    }

    const dedupeKey = buildBankTxDedupeKey({
      accountIban,
      bookingDate,
      direction,
      amount,
      documentNumber,
      counterpartyIban,
      counterpartyIdno,
      purpose,
    });

    if (seenKeys.has(dedupeKey)) {
      warnings.push({ line: lineNo, message: "Duplicate row within file; skipped" });
      i = j;
      continue;
    }
    seenKeys.add(dedupeKey);

    if (!minDate || bookingDate < minDate) minDate = bookingDate;
    if (!maxDate || bookingDate > maxDate) maxDate = bookingDate;

    transactions.push({
      bookingDate,
      valueDate: null,
      direction,
      amount,
      currency,
      counterpartyName,
      counterpartyIdno,
      counterpartyIban,
      purpose: purpose || null,
      documentNumber,
      bankRef: documentNumber,
      txTypeCode,
      dedupeKey,
    });

    i = j;
  }

  return {
    accountIban,
    openingBalance,
    periodFrom: periodFrom ?? minDate,
    periodTo: periodTo ?? maxDate,
    currency,
    transactions,
    warnings,
  };
}
