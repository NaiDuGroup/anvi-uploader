/**
 * Parses the SFS e-Factura WEB PORTAL grid (efactura.sfs.md, the "FM.Grid"
 * widget) into structured fiscal invoices.
 *
 * This is our workaround for the 380 "Завершённые"/Accepted invoices that the
 * SOAP API (efactura-api.sfs.md) will not enumerate: unlike the API list methods,
 * the portal grid carries the full buyer + amounts. The user exports the grid
 * (paste HTML or a browser-console dump) and we import it.
 *
 * Grid row shape (`<tr class='row' oid='<guid>'>` with positional `<td>`s):
 *   0 checkbox · 1 doctype img · 2 buyer "IDNO - NAME" · 3 buyer type ·
 *   4 seria · 5 number · 6 issue date (dd.mm.yyyy) · 7 total VAT · 8 total ·
 *   9 created by · 10 created on · ...
 */

export interface ParsedGridInvoice {
  oid: string | null;
  buyerIdno: string | null;
  buyerName: string | null;
  seria: string;
  number: string;
  issueDate: string | null;
  totalAmount: string | null;
  vatAmount: string | null;
}

export interface ParsedGrid {
  invoices: ParsedGridInvoice[];
  /** `total` attribute on the rows table, if present (e.g. 380). */
  reportedTotal: number | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Strips tags from a `<td>` cell and returns its trimmed text. */
function cellText(cellHtml: string): string {
  return decodeEntities(cellHtml.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** "10 696,00" / "1 782,67" (ru locale) -> "10696.00". Empty -> null. */
function parseAmount(raw: string): string | null {
  const cleaned = raw.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return cleaned;
}

/** "06.07.2026" -> ISO date string. */
function parseDate(raw: string): string | null {
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  // Store as UTC midnight so the calendar day is stable regardless of server TZ.
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd))).toISOString();
}

/** Splits "1004600069507 - CRAFTI BUSINESS S.R.L." into IDNO + name. */
function parseBuyer(raw: string): { idno: string | null; name: string | null } {
  const m = raw.match(/^\s*(\d{6,})\s*-\s*(.+?)\s*$/);
  if (m) return { idno: m[1], name: m[2] };
  const trimmed = raw.trim();
  return { idno: null, name: trimmed || null };
}

export function parseEFacturaGridHtml(html: string): ParsedGrid {
  const totalMatch = html.match(/<table[^>]*class=['"]fm-dg-rows['"][^>]*\btotal=['"](\d+)['"]/);
  const reportedTotal = totalMatch ? Number(totalMatch[1]) : null;

  const invoices: ParsedGridInvoice[] = [];
  const rowRe = /<tr[^>]*class=['"]row['"][^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[0];
    const oid = rowHtml.match(/\boid=['"]([^'"]+)['"]/)?.[1] ?? null;

    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      cellText(c[1]),
    );
    if (cells.length < 9) continue;

    const seria = cells[4];
    const number = cells[5];
    // Guard against layout drift: require a plausible seria + numeric number.
    if (!/^[A-Za-z]{2,5}$/.test(seria) || !/^\d{3,}$/.test(number)) continue;

    const buyer = parseBuyer(cells[2]);
    invoices.push({
      oid,
      buyerIdno: buyer.idno,
      buyerName: buyer.name,
      seria: seria.toUpperCase(),
      number,
      issueDate: parseDate(cells[6]),
      vatAmount: parseAmount(cells[7]),
      totalAmount: parseAmount(cells[8]),
    });
  }

  return { invoices, reportedTotal };
}
