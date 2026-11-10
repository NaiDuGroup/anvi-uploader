/**
 * Parses the invoice `<Document>` XML returned inside `GetInvoicesBySeriaNumber`
 * / `GetInvoicesForSigning` (`XmlInvoice.Xml`). This is the ONLY place e-Factura
 * exposes structured buyer + amount data — the list methods return identity only.
 *
 * Observed shape (real ANVI-STUDIO invoice):
 *   <Document>
 *     <SupplierInfo><Seria>EBH</Seria><Number>000034134</Number>
 *                   <IssuedDate>2026-04-04T...</IssuedDate>...</SupplierInfo>
 *     <Supplier IDNO="1023600000396" Title="&quot;ANVI-STUDIO GROUP&quot; S.R.L." .../>
 *     <Buyer IDNO="1003600029104" Title="PRUT INTERNATIONAL S.R.L." CodTVA="..." .../>
 *     <Total>1371.50</Total>
 *     <TotalTVA>228.58</TotalTVA>
 *     ...
 *   </Document>
 * Attribute values may still contain XML entities (e.g. &quot;) because the
 * document was double-encoded on the wire.
 */

/** One goods/services line from `<Merchandises><Row .../></Merchandises>`. */
export interface ParsedInvoiceLine {
  name: string | null;
  unit: string | null;
  quantity: string | null;
  /** Unit price excl. VAT. */
  unitPrice: string | null;
  /** Line total excl. VAT. */
  totalWithoutVat: string | null;
  /** VAT rate, percent. */
  vatRate: string | null;
  vatAmount: string | null;
  /** Line total incl. VAT. */
  total: string | null;
}

export interface ParsedInvoiceXml {
  seria: string | null;
  number: string | null;
  issueDate: string | null;
  deliveryDate: string | null;
  buyerIdno: string | null;
  buyerName: string | null;
  buyerAddress: string | null;
  supplierIdno: string | null;
  supplierName: string | null;
  /** Grand total incl. VAT (<Total>). */
  totalAmount: string | null;
  /** VAT portion (<TotalTVA>). */
  vatAmount: string | null;
  lines: ParsedInvoiceLine[];
  /**
   * Raw "Путевой лист / Прилагаемые документы" reference from
   * `<VehicleLogbook><Number>`, e.g. "B/f 0013 din data 09.07.2026 (card)".
   */
  receiptRef: string | null;
  /** True when the reference is a fiscal receipt ("B/f" / bon fiscal): the
   * invoice was already collected at the terminal (not via bank transfer). */
  settledByReceipt: boolean;
  /** "card" when the receipt text marks a card payment, "cash" otherwise. */
  receiptMethod: "card" | "cash" | null;
  /** Receipt date parsed from "din data DD.MM.YYYY" (ISO), when present. */
  receiptDate: string | null;
  /**
   * Creation reason / redirect from `<Redirections>`, e.g. "Non-livrare"
   * (Non-livrare / Neplatitor TVA — not a delivery receivable).
   */
  redirections: string | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function firstTagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`));
  return m ? decodeEntities(m[1]).trim() || null : null;
}

function attr(openTag: string, name: string): string | null {
  const m = openTag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]).trim() || null : null;
}

function parseLines(xml: string): ParsedInvoiceLine[] {
  const block = xml.match(/<Merchandises\b[^>]*>([\s\S]*?)<\/Merchandises>/)?.[1];
  if (!block) return [];
  const rows = block.match(/<Row\b[^>]*\/?>/g) ?? [];
  return rows.map((row) => ({
    name: attr(row, "Name"),
    unit: attr(row, "UnitOfMeasure"),
    quantity: attr(row, "Quantity"),
    unitPrice: attr(row, "UnitPriceWithoutTVA"),
    totalWithoutVat: attr(row, "TotalPriceWithoutTVA"),
    vatRate: attr(row, "TVA"),
    vatAmount: attr(row, "TotalTVA"),
    total: attr(row, "TotalPrice"),
  }));
}

/**
 * Extracts the settlement reference that marks how a fiscal invoice was paid.
 * Priority:
 *  1. `<AttachedDocuments>` (SFS UI: "Прилагаемые документы")
 *  2. `<Notes>` (SFS UI: "Примечания") — common for older "bon fiscal / b/f" text
 *  3. `<VehicleLogbook>` seria+number (waybill fallback)
 * Examples: "b/f 0013 din 09.07.2026 (card)", "cec din 18.01.2024",
 * "numerar", "card 19.03.2026", "bon fiscal 0017 din 15.10.2024".
 */
function parseAttachedRef(xml: string): string | null {
  const attached = firstTagText(xml, "AttachedDocuments");
  if (attached) return attached;
  const notes = firstTagText(xml, "Notes");
  if (notes) return notes;
  const block = xml.match(/<VehicleLogbook\b[^>]*>([\s\S]*?)<\/VehicleLogbook>/)?.[1];
  if (block) {
    const seria = firstTagText(block, "Seria");
    const number = firstTagText(block, "Number");
    const text = [seria, number].filter(Boolean).join(" ").trim();
    if (text) return text;
  }
  return null;
}

/**
 * Fiscal-receipt markers. A bare «bon» is NOT one: «bon de comandă» (purchase
 * order), «bon de livrare / predare» (delivery note) are ordinary paperwork.
 * Accepted: b/f (b f, b.f), «bon(ul) fiscal», «bonuri fiscale», «cec / cek»
 * (optionally «fiscal»).
 */
const RECEIPT_MARKERS: readonly RegExp[] = [
  /\bb\s*[/.]?\s*f\b\.?/i,
  /\bbon(?:ul|uri)?\s+fiscal(?:e)?\b/i,
  /\bce[ck](?:ul)?\b(?:\s+fiscal\b)?/i,
];
/** Payment-method words that on their own also mean "collected at the counter". */
const METHOD_MARKERS: readonly RegExp[] = [/\bnumerar\b/i, /\bcard\b/i];

const DATE_RE = /(\d{2})[.\-/](\d{2})[.\-/](\d{2,4})/g;

function firstMarkerIndex(ref: string, patterns: readonly RegExp[]): number {
  let best = -1;
  for (const re of patterns) {
    const m = re.exec(ref);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

/** DD.MM.YYYY nearest after `from` (else the last one before it) as UTC midnight ISO. */
function receiptDateNear(ref: string, from: number): string | null {
  let before: RegExpExecArray | null = null;
  let after: RegExpExecArray | null = null;
  for (const m of ref.matchAll(DATE_RE)) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) continue;
    if (m.index! >= from) {
      after = m as RegExpExecArray;
      break;
    }
    before = m as RegExpExecArray;
  }
  const m = after ?? before;
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]))).toISOString();
}

/**
 * Interprets an attached-document reference. A fiscal-receipt marker (b/f,
 * bon fiscal, cec) or a POS payment word (numerar, card) means the invoice
 * was already collected at the counter, so it will never appear as a bank
 * transfer. The receipt date is the date nearest AFTER the marker (a contract
 * date earlier in the same note is not the receipt date). Shared by the sales
 * (fiscal_invoices) and purchase sides.
 */
export function interpretReceipt(ref: string | null): {
  settledByReceipt: boolean;
  receiptMethod: "card" | "cash" | null;
  receiptDate: string | null;
} {
  if (!ref) return { settledByReceipt: false, receiptMethod: null, receiptDate: null };
  const receiptAt = firstMarkerIndex(ref, RECEIPT_MARKERS);
  const methodAt = firstMarkerIndex(ref, METHOD_MARKERS);
  if (receiptAt < 0 && methodAt < 0) {
    return { settledByReceipt: false, receiptMethod: null, receiptDate: null };
  }
  const receiptMethod: "card" | "cash" | null = /\bcard\b/i.test(ref)
    ? "card"
    : /\bnumerar\b/i.test(ref)
      ? "cash"
      : null;
  const receiptDate = receiptDateNear(ref, receiptAt >= 0 ? receiptAt : methodAt);
  return { settledByReceipt: true, receiptMethod, receiptDate };
}

/**
 * Some signed invoices carry a broken document-level <TotalTVA> (the decimal
 * point lost: 2083.33 -> 208333) while the line TotalTVA values are right.
 * VAT can never exceed the invoice total, so in that case trust the lines.
 */
function pickDocumentVat(
  headerVat: string | null,
  total: string | null,
  lines: ParsedInvoiceLine[],
): string | null {
  const vat = headerVat == null ? NaN : Number(headerVat);
  const sum = total == null ? NaN : Number(total);
  if (!Number.isFinite(vat) || !Number.isFinite(sum)) return headerVat;
  if (Math.abs(vat) <= Math.abs(sum)) return headerVat;
  const lineVats = lines.map((l) => Number(l.vatAmount));
  if (lineVats.length === 0 || lineVats.some((v) => !Number.isFinite(v))) return headerVat;
  return lineVats.reduce((a, b) => a + b, 0).toFixed(2);
}

export function parseInvoiceXml(xml: string): ParsedInvoiceXml {
  const supplierTag = xml.match(/<Supplier\b[^>]*>/)?.[0] ?? "";
  const buyerTag = xml.match(/<Buyer\b[^>]*>/)?.[0] ?? "";
  const receiptRef = parseAttachedRef(xml);
  const receipt = interpretReceipt(receiptRef);
  const totalAmount = firstTagText(xml, "Total");
  const lines = parseLines(xml);

  return {
    seria: firstTagText(xml, "Seria"),
    number: firstTagText(xml, "Number"),
    issueDate: firstTagText(xml, "IssuedDate"),
    deliveryDate: firstTagText(xml, "DeliveryDate"),
    buyerIdno: attr(buyerTag, "IDNO"),
    buyerName: attr(buyerTag, "Title"),
    buyerAddress: attr(buyerTag, "Address"),
    supplierIdno: attr(supplierTag, "IDNO"),
    supplierName: attr(supplierTag, "Title"),
    totalAmount,
    vatAmount: pickDocumentVat(firstTagText(xml, "TotalTVA"), totalAmount, lines),
    lines,
    receiptRef,
    settledByReceipt: receipt.settledByReceipt,
    receiptMethod: receipt.receiptMethod,
    receiptDate: receipt.receiptDate,
    redirections: firstTagText(xml, "Redirections"),
  };
}
