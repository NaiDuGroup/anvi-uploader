/**
 * Parses the SFS e-Factura portal "Registrul FF" CSV export (the "Завершённые"
 * folder). This is the one-file source for the 380 completed invoices the SOAP
 * API won't enumerate — it carries full buyer + amounts.
 *
 * Format (delimiter ';', UTF-8 with BOM, standard CSV quoting with "" escapes):
 *   Покупатель;Тип покупателя;Серия;Номер;Дата выдачи;Всего НДС;Всего;Создано;...
 *   1004600069507 - CRAFTI BUSINESS S.R.L.;;EBJ;000939286;2026-07-06 16:35:46.883;1782.6700;10696.0000;...
 */

import type { ParsedGrid, ParsedGridInvoice } from "./parseGridHtml";

/** Header labels we map to fields (order-independent). */
const COLUMN_ALIASES: Record<keyof HeaderIndex, string[]> = {
  buyer: ["Покупатель", "Cumpărător", "Buyer"],
  seria: ["Серия", "Seria"],
  number: ["Номер", "Numărul", "Number"],
  issueDate: ["Дата выдачи", "Data eliberării", "IssuedDate"],
  vat: ["Всего НДС", "Total TVA", "TotalTVA"],
  total: ["Всего", "Total"],
};

interface HeaderIndex {
  buyer: number;
  seria: number;
  number: number;
  issueDate: number;
  vat: number;
  total: number;
}

/** Splits CSV content into rows of fields, honoring quotes and the delimiter. */
function parseCsvRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore; handled by \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseAmount(raw: string): string | null {
  let v = (raw ?? "").trim().replace(/[\s\u00a0]/g, "");
  if (!v) return null;
  // ru comma-decimal (e.g. "10696,00") -> dot; export with ';' uses dot already.
  if (v.includes(",") && !v.includes(".")) v = v.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  return v;
}

function parseDate(raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  // Formats: "2026-07-06 16:35:46.883" or "06.07.2026".
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toISOString();
  }
  m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toISOString();
  }
  return null;
}

function parseBuyer(raw: string): { idno: string | null; name: string | null } {
  const m = (raw ?? "").match(/^\s*(\d{6,})\s*-\s*(.+?)\s*$/);
  if (m) return { idno: m[1], name: m[2] };
  const trimmed = (raw ?? "").trim();
  return { idno: null, name: trimmed || null };
}

function resolveHeader(header: string[]): HeaderIndex | null {
  const norm = header.map((h) => h.trim().toLowerCase());
  const find = (aliases: string[]) =>
    norm.findIndex((h) => aliases.some((a) => h === a.toLowerCase()));

  const idx: HeaderIndex = {
    buyer: find(COLUMN_ALIASES.buyer),
    seria: find(COLUMN_ALIASES.seria),
    number: find(COLUMN_ALIASES.number),
    issueDate: find(COLUMN_ALIASES.issueDate),
    vat: find(COLUMN_ALIASES.vat),
    total: find(COLUMN_ALIASES.total),
  };
  if (idx.seria < 0 || idx.number < 0 || idx.buyer < 0) return null;
  return idx;
}

export function parseEFacturaCsv(content: string): ParsedGrid {
  const clean = content.replace(/^\uFEFF/, ""); // strip BOM
  const delimiter = (clean.split("\n")[0] ?? "").includes(";") ? ";" : ",";
  const rows = parseCsvRows(clean, delimiter).filter((r) => r.some((c) => c.trim()));
  if (rows.length === 0) return { invoices: [], reportedTotal: null };

  const idx = resolveHeader(rows[0]);
  if (!idx) return { invoices: [], reportedTotal: null };

  const invoices: ParsedGridInvoice[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const seria = (cells[idx.seria] ?? "").trim();
    const number = (cells[idx.number] ?? "").trim();
    if (!/^[A-Za-z]{2,5}$/.test(seria) || !/^\d{3,}$/.test(number)) continue;

    const buyer = parseBuyer(cells[idx.buyer] ?? "");
    invoices.push({
      oid: null,
      buyerIdno: buyer.idno,
      buyerName: buyer.name,
      seria: seria.toUpperCase(),
      number,
      issueDate: idx.issueDate >= 0 ? parseDate(cells[idx.issueDate] ?? "") : null,
      vatAmount: idx.vat >= 0 ? parseAmount(cells[idx.vat] ?? "") : null,
      totalAmount: idx.total >= 0 ? parseAmount(cells[idx.total] ?? "") : null,
    });
  }

  return { invoices, reportedTotal: invoices.length };
}
