import { buildBankTxDedupeKey } from "./dedupeKey";
import type {
  NormalizedTransaction,
  ParsedStatement,
  ParseOptions,
  ParseWarning,
} from "./types";

/**
 * Parser for MAIB (Moldova-Agroindbank) "current account statement" CSV export.
 *
 * Column layout (header row present in the file):
 *   DATA,NDOC,DC,ST,CCL,CCOR,CCORT,CFC,CFCCOR,CBC,DENC,DENCT,TV,SUMN,SUML,TD,
 *   DE1,DE2,DE3,DE4,PRI,DAT_TR,DAT_AC,BIC,COD_TRANZ,URGENT
 *
 * Notable quirks handled here:
 *  - The line right after the header holds only the opening balance ("sold
 *    initial") in the first cell; it is not a transaction. On card ("BATCH")
 *    exports this cell can be `null` or empty instead of a number.
 *  - `DC` is the direction flag: 1 = credit (incoming), 0 = debit (outgoing).
 *  - The purpose is split by fixed width across DE1..DE4 (often mid-word), so we
 *    concatenate them with no separator and collapse runs of whitespace.
 *  - `CFC`/`CFCCOR` are payer/beneficiary fiscal codes; which one is the
 *    counterparty depends on direction (and on which one is not ours).
 *  - Dates are `DD-MM-YYYY`.
 */

const EXPECTED_HEADER = [
  "DATA", "NDOC", "DC", "ST", "CCL", "CCOR", "CCORT", "CFC", "CFCCOR", "CBC",
  "DENC", "DENCT", "TV", "SUMN", "SUML", "TD", "DE1", "DE2", "DE3", "DE4",
  "PRI", "DAT_TR", "DAT_AC", "BIC", "COD_TRANZ", "URGENT",
] as const;

const COL = {
  DATA: 0, NDOC: 1, DC: 2, ST: 3, CCL: 4, CCOR: 5, CCORT: 6, CFC: 7,
  CFCCOR: 8, CBC: 9, DENC: 10, DENCT: 11, TV: 12, SUMN: 13, SUML: 14, TD: 15,
  DE1: 16, DE2: 17, DE3: 18, DE4: 19, PRI: 20, DAT_TR: 21, DAT_AC: 22,
  BIC: 23, COD_TRANZ: 24, URGENT: 25,
} as const;

/** Minimal RFC-4180-style splitter (handles quoted fields defensively). */
function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === "^") {
    // MAIB caret exports are never quoted; keep this path simple.
    return line.split("^");
  }
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function detectDelimiter(headerLine: string): string {
  const carets = (headerLine.match(/\^/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return carets > commas ? "^" : ",";
}

/** Required columns for a usable MAIB statement row (CCORT is optional). */
const REQUIRED_COLS = [
  "DATA",
  "NDOC",
  "DC",
  "CCL",
  "CCOR",
  "CFC",
  "CFCCOR",
  "DENC",
  "SUMN",
  "SUML",
  "TD",
  "DE1",
] as const;

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Cleans a counterparty name from the DENC column. MAIB prefixes names with a
 * residency marker like `(R)` (resident) / `(N)` (non-resident); strip it so
 * names display cleanly and match better during reconciliation.
 */
function cleanCounterpartyName(value: string | undefined): string {
  return cleanText(value).replace(/^\([A-Za-z]{1,2}\)\s*/, "").trim();
}

/**
 * Parses booking dates from MAIB exports:
 *  - `DD-MM-YYYY` / `DD.MM.YYYY` (current-account CSV)
 *  - `MM/DD/YY` / `MM/DD/YYYY` (some card caret exports)
 */
function parseStatementDate(value: string | undefined): Date | null {
  const raw = (value ?? "").trim();
  const dmy = raw.match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }
  return null;
}

/** Normalizes an amount string to a 2-dp decimal string, or null if invalid. */
function parseAmount(value: string | undefined): string | null {
  const raw = (value ?? "").replace(/\s+/g, "").replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n).toFixed(2);
}

function isOpeningBalanceRow(cells: string[], dataIdx: number): boolean {
  if (cells.length === 0) return false;
  const rest = cells.slice(1).some((c) => (c ?? "").trim().length > 0);
  if (rest) return false;
  // Only the first cell is populated: the "sold initial" row. It carries a
  // numeric balance on account statements, or "null"/empty on card statements.
  const first = (cells[dataIdx] ?? cells[0] ?? "").trim();
  return (
    first.length === 0 ||
    first.toLowerCase() === "null" ||
    Number.isFinite(Number(first))
  );
}

function cell(cells: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0) return "";
  return cells[idx] ?? "";
}

/**
 * Parses a MAIB CSV statement. Never throws on bad rows: unparseable lines are
 * skipped and reported in `warnings`.
 */
export function parseMaibCsv(
  content: string,
  options: ParseOptions = {},
): ParsedStatement {
  const ourFiscalCode = (options.ourFiscalCode ?? "").trim();
  const warnings: ParseWarning[] = [];
  const transactions: NormalizedTransaction[] = [];

  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .filter((l, i, arr) => !(l.trim() === "" && i === arr.length - 1));

  if (lines.length === 0) {
    return {
      accountIban: options.ourIban ?? null,
      openingBalance: null,
      periodFrom: null,
      periodTo: null,
      currency: "MDL",
      transactions,
      warnings: [{ line: 0, message: "Empty file" }],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  let header = splitDelimitedLine(lines[0], delimiter).map((h) =>
    h.trim().toUpperCase(),
  );
  // Some card caret exports omit CCORT from the header line but still emit the
  // empty column in every data row — restore the canonical column order.
  if (
    !header.includes("CCORT") &&
    header.length === EXPECTED_HEADER.length - 1 &&
    header[0] === "DATA" &&
    header[5] === "CCOR" &&
    header[6] === "CFC"
  ) {
    header = [...header.slice(0, 6), "CCORT", ...header.slice(6)];
  }
  const colIndex = new Map(header.map((name, i) => [name, i]));
  const missingRequired = REQUIRED_COLS.filter((c) => !colIndex.has(c));
  if (missingRequired.length > 0) {
    warnings.push({
      line: 1,
      message: `Unexpected header. Missing columns: ${missingRequired.join(", ")}. Expected MAIB columns starting with ${EXPECTED_HEADER.slice(0, 4).join(",")}...`,
    });
  }

  const idx = {
    DATA: colIndex.get("DATA") ?? COL.DATA,
    NDOC: colIndex.get("NDOC") ?? COL.NDOC,
    DC: colIndex.get("DC") ?? COL.DC,
    CCL: colIndex.get("CCL") ?? COL.CCL,
    CCOR: colIndex.get("CCOR") ?? COL.CCOR,
    CFC: colIndex.get("CFC") ?? COL.CFC,
    CFCCOR: colIndex.get("CFCCOR") ?? COL.CFCCOR,
    DENC: colIndex.get("DENC") ?? COL.DENC,
    TV: colIndex.get("TV") ?? COL.TV,
    SUMN: colIndex.get("SUMN") ?? COL.SUMN,
    SUML: colIndex.get("SUML") ?? COL.SUML,
    TD: colIndex.get("TD") ?? COL.TD,
    DE1: colIndex.get("DE1") ?? COL.DE1,
    DE2: colIndex.get("DE2") ?? COL.DE2,
    DE3: colIndex.get("DE3") ?? COL.DE3,
    DE4: colIndex.get("DE4") ?? COL.DE4,
    DAT_AC: colIndex.get("DAT_AC") ?? COL.DAT_AC,
  };

  let openingBalance: string | null = null;
  let accountIban: string | null = options.ourIban ?? null;
  let currency = "MDL";
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  const seenKeys = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine.trim() === "") continue;
    const cells = splitDelimitedLine(rawLine, delimiter);
    const lineNo = i + 1;

    if (openingBalance === null && isOpeningBalanceRow(cells, idx.DATA)) {
      openingBalance = parseAmount(cell(cells, idx.DATA));
      continue;
    }

    const bookingDate = parseStatementDate(cell(cells, idx.DATA));
    if (!bookingDate) {
      warnings.push({
        line: lineNo,
        message: `Unrecognized date "${cell(cells, idx.DATA).trim()}"; row skipped`,
      });
      continue;
    }

    const amount =
      parseAmount(cell(cells, idx.SUML)) ?? parseAmount(cell(cells, idx.SUMN));
    if (amount === null) {
      warnings.push({ line: lineNo, message: "Missing/invalid amount; row skipped" });
      continue;
    }

    const dcRaw = cell(cells, idx.DC).trim();
    const direction: "CREDIT" | "DEBIT" = dcRaw === "1" ? "CREDIT" : "DEBIT";

    const ccl = cleanText(cell(cells, idx.CCL));
    if (!accountIban && ccl) accountIban = ccl;
    const tv = cleanText(cell(cells, idx.TV));
    if (tv) currency = tv;

    const cfc = cleanText(cell(cells, idx.CFC));
    const cfccor = cleanText(cell(cells, idx.CFCCOR));
    let counterpartyIdno: string | null =
      direction === "CREDIT" ? cfc || null : cfccor || null;
    if (ourFiscalCode && (!counterpartyIdno || counterpartyIdno === ourFiscalCode)) {
      counterpartyIdno = [cfc, cfccor].find((c) => c && c !== ourFiscalCode) ?? counterpartyIdno;
    }

    const purpose =
      cleanText(
        `${cell(cells, idx.DE1)}${cell(cells, idx.DE2)}${cell(cells, idx.DE3)}${cell(cells, idx.DE4)}`,
      ) || null;

    const documentNumber = cleanText(cell(cells, idx.NDOC)) || null;
    const counterpartyName = cleanCounterpartyName(cell(cells, idx.DENC)) || null;
    const counterpartyIban = cleanText(cell(cells, idx.CCOR)) || null;
    const txTypeCode = cleanText(cell(cells, idx.TD)) || null;
    const valueDate = parseStatementDate(cell(cells, idx.DAT_AC));

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
      continue;
    }
    seenKeys.add(dedupeKey);

    if (!minDate || bookingDate < minDate) minDate = bookingDate;
    if (!maxDate || bookingDate > maxDate) maxDate = bookingDate;

    transactions.push({
      bookingDate,
      valueDate,
      direction,
      amount,
      currency: tv || currency,
      counterpartyName,
      counterpartyIdno,
      counterpartyIban,
      purpose,
      documentNumber,
      bankRef: documentNumber,
      txTypeCode,
      dedupeKey,
    });
  }

  return {
    accountIban,
    openingBalance,
    periodFrom: minDate,
    periodTo: maxDate,
    currency,
    transactions,
    warnings,
  };
}
