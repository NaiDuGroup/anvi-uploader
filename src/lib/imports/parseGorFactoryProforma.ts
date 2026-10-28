/**
 * Lines of a Gor Factory (ROLY / Stamina) proforma or invoice, read from the
 * PDF text lines ({@link import("./pdfTextLines").pdfTextLines}). A product row
 * reads «CODE DESCRIPTION Total Parcels Pieces Price Amount»; a description may
 * wrap onto the next line; «Made in» / «Taric code» notes are dropped.
 */

export interface ParsedProformaLine {
  supplierCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ParsedProforma {
  proformaNo: string | null;
  /** Order on the supplier site, e.g. «4457712-OG». */
  supplierOrderNo: string | null;
  /** Document date (YYYY-MM-DD). */
  date: string | null;
  currency: string | null;
  lines: ParsedProformaLine[];
  /** Totals printed on the document (null when not found). */
  documentPieces: number | null;
  documentAmount: number | null;
  /** Freight / other charges printed on the document (null when not found). */
  freight: number | null;
  /** Problems a person should look at (totals not matching, rows not read). */
  warnings: string[];
}

const CODE = String.raw`[A-Z]{2}\d{4}S\d{3,6}|[A-Z]{2}\d{8,10}`;
const NUM = String.raw`\d{1,3}(?:,\d{3})*\.\d{2,4}`;
const ROW_RE = new RegExp(
  String.raw`^(${CODE})\s+(.*?)\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})$`,
);
const CODE_ONLY_RE = new RegExp(String.raw`^(${CODE})\s+(.+)$`);
const NUMS_ONLY_RE = new RegExp(String.raw`^(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})$`);
/** Company line printed vertically in the margin; pdf.js merges it into a row. */
const MARGIN_RE = /GOR FACTORY, S\.A\., Registered in[^]*?ESA-[\d.]+\.?/g;

type Nums = { quantity: number; unitPrice: number; amount: number };

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function stripNotes(line: string): string {
  return line
    .replace(MARGIN_RE, " ")
    .replace(/Made in:\s*[A-Za-z ]+?(?=\s+Taric code|\s*$|\s+[A-Z]{2}\d)/g, " ")
    .replace(/Taric code:\s*\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A wrapped description tail: upper-case words only, no digits-heavy tokens. */
function isDescriptionTail(line: string): boolean {
  return /^[A-Z][A-Z/ \-]{0,40}$/.test(line) && !/^(GOR FACTORY|PROFORMA|INVOICE|TOTAL|BANK)/.test(line);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseGorFactoryProforma(rawLines: readonly string[]): ParsedProforma {
  const lines: ParsedProformaLine[] = [];
  const warnings: string[] = [];
  const text: string = rawLines.join("\n");
  let lastWasItem = false;
  // pdf.js may put a row's numbers on their own line just above (or below) the
  // code + description; pair them in reading order.
  let pending: Nums | null = null;
  let awaiting: ParsedProformaLine | null = null;
  const numsOf = (m: RegExpExecArray, from: number): Nums => ({
    quantity: num(m[from + 2]!),
    unitPrice: num(m[from + 3]!),
    amount: num(m[from + 4]!),
  });

  for (const raw of rawLines) {
    const line: string = stripNotes(raw);
    if (!line) continue;
    const full = ROW_RE.exec(line);
    if (full) {
      lines.push({ supplierCode: full[1]!, description: full[2]!.trim(), ...numsOf(full, 3) });
      lastWasItem = true;
      awaiting = null;
      continue;
    }
    const nums = NUMS_ONLY_RE.exec(line);
    if (nums) {
      if (awaiting) {
        Object.assign(awaiting, numsOf(nums, 1));
        awaiting = null;
      } else {
        pending = numsOf(nums, 1);
      }
      lastWasItem = false;
      continue;
    }
    const codeOnly = CODE_ONLY_RE.exec(line);
    if (codeOnly && !/\d+\.\d{2}/.test(codeOnly[2]!)) {
      const item: ParsedProformaLine = {
        supplierCode: codeOnly[1]!,
        description: codeOnly[2]!.trim(),
        quantity: NaN,
        unitPrice: NaN,
        amount: NaN,
      };
      if (pending) {
        Object.assign(item, pending);
        pending = null;
      } else {
        awaiting = item;
      }
      lines.push(item);
      lastWasItem = true;
      continue;
    }
    if (lastWasItem && isDescriptionTail(line)) {
      const prev = lines[lines.length - 1]!;
      prev.description = `${prev.description} ${line}`.trim();
      continue;
    }
    lastWasItem = false;
  }
  for (const l of lines.filter((x) => !Number.isFinite(x.amount))) {
    warnings.push(`Строка не прочитана целиком: ${l.supplierCode} ${l.description}`);
  }
  lines.splice(0, lines.length, ...lines.filter((x) => Number.isFinite(x.amount)));

  // Header: «Date Order number» then «15/10/26 402229536» (or each on its own line).
  const head = /Date\s+Order number\s*\n\s*(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{6,})/.exec(text);
  const proformaNo: string | null =
    head?.[4] ?? /Order number\s*\n?\s*(\d{6,})/.exec(text)?.[1] ?? null;
  const supplierOrderNo: string | null = /client request:\s*(\d+-[A-Z]{2})/.exec(text)?.[1] ?? null;
  const dm = head ? [head[0], head[1], head[2], head[3]] : /Date\s*\n?\s*(\d{2})\/(\d{2})\/(\d{2,4})/.exec(text);
  const date: string | null = dm ? `${dm[3]!.length === 2 ? `20${dm[3]}` : dm[3]}-${dm[2]}-${dm[1]}` : null;
  // «VAT Number Currency» … «MD0510012 EUR»: the first currency code after the label.
  const currency: string | null =
    /Currency[\s\S]{0,160}?\b(EUR|USD|GBP|RON|MDL|CNY)\b/.exec(text)?.[1] ??
    /Currency\s*\n?\s*([A-Z]{3})\b/.exec(text)?.[1] ??
    null;
  const piecesM = /Pieces\s*:\s*([\d,]+)/.exec(text);
  const documentPieces: number | null = piecesM ? num(piecesM[1]!) : null;
  const totalM = /TOTAL AMOUNT[\s\S]{0,200}?(\d{1,3}(?:,\d{3})*\.\d{2})\s*EUR/.exec(text);
  const amountsEur = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})\s*EUR/g)].map((x) => num(x[1]!));
  const documentAmount: number | null = totalM ? num(totalM[1]!) : amountsEur.length ? Math.max(...amountsEur) : null;
  const freightM = /FREIGHT:\s*(\d{1,3}(?:,\d{3})*\.\d{2})/.exec(text);
  const freight: number | null = freightM ? num(freightM[1]!) : null;

  const pieces: number = lines.reduce((s, l) => s + l.quantity, 0);
  const amount: number = round2(lines.reduce((s, l) => s + l.amount, 0));
  if (lines.length === 0) warnings.push("Не найдено ни одной строки товара");
  if (documentPieces != null && Math.abs(documentPieces - pieces) > 0.001) {
    warnings.push(`Штук в строках ${pieces}, в документе ${documentPieces}`);
  }
  if (documentAmount != null && Math.abs(documentAmount - (freight ?? 0) - amount) > 0.05) {
    warnings.push(`Сумма строк ${amount.toFixed(2)}, в документе ${documentAmount.toFixed(2)}${freight ? ` (доставка ${freight.toFixed(2)})` : ""}`);
  }
  for (const l of lines) {
    if (Math.abs(l.quantity * l.unitPrice - l.amount) > Math.max(0.05, l.amount * 0.002)) {
      warnings.push(`${l.supplierCode}: ${l.quantity} × ${l.unitPrice} ≠ ${l.amount}`);
    }
  }
  return { proformaNo, supplierOrderNo, date, currency, lines, documentPieces, documentAmount, freight, warnings };
}
