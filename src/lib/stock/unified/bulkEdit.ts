import { z } from "zod";
import { mdlPriceSchema } from "@/lib/validations";
import { MAX_STOCK_QUANTITY } from "./quantity";

/**
 * Whole-category screens: «Цены» (edit retail / dealer prices of many variants at once)
 * and «Инвентаризация» (count sheet: enter the counted quantity of many variants at once).
 * Client-safe: no Prisma imports.
 */

/** Categories priced on their own screens (per metre / per sheet), left out of «Цены». */
export const PRICE_SCREEN_EXCLUDED_CATEGORIES: readonly string[] = ["roll_media", "sheet_paper"];

const MAX_ROWS = 3000;
const quantitySchema = z.number().finite().min(0).max(MAX_STOCK_QUANTITY);

/** POST /api/admin/stock/prices — only the fields that changed; null clears a price. */
export const stockBulkPriceSchema = z.object({
  updates: z
    .array(
      z
        .object({
          variantId: z.string().uuid(),
          sellPrice: mdlPriceSchema.nullable().optional(),
          dealerPrice: mdlPriceSchema.nullable().optional(),
        })
        .refine((u) => u.sellPrice !== undefined || u.dealerPrice !== undefined, "nothing_to_update"),
    )
    .min(1)
    .max(MAX_ROWS),
});
export type StockBulkPriceBody = z.infer<typeof stockBulkPriceSchema>;

/**
 * POST /api/admin/stock/stocktake — counted quantities plus the book quantity
 * the person saw while counting (`expectedQuantity`), see {@link stocktakeTarget}.
 */
export const stocktakeSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
  counts: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        countedQuantity: quantitySchema,
        expectedQuantity: z.number().finite().min(-MAX_STOCK_QUANTITY).max(MAX_STOCK_QUANTITY),
      }),
    )
    .min(1)
    .max(MAX_ROWS),
});
export type StocktakeBody = z.infer<typeof stocktakeSchema>;

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Balance to set after a count. Orders may take or return stock between the
 * moment a shelf was counted and the moment the sheet is saved; those
 * movements already changed the book balance, so the counted difference is
 * applied on top of the current balance instead of overwriting it.
 */
export function stocktakeTarget(current: number, counted: number, expected: number): number {
  return Math.max(0, roundQty(current + (counted - expected)));
}

/** Retail / dealer markup over cost in whole percent; null when either side is unknown. */
export function markupPercent(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null || cost <= 0) return null;
  return Math.round(((price - cost) / cost) * 100);
}

/** Change a price by `percent` and round to whole lei (`step` = 1) or to `step` lei. */
export function adjustPrice(price: number, percent: number, step: number = 1): number {
  const raw: number = price * (1 + percent / 100);
  const s: number = step > 0 ? step : 1;
  return Math.max(0, Math.round(raw / s) * s);
}

// ─── CSV (opens in Excel; «;» because ro/ru Excel expects it) ────────────────

const CSV_SEPARATOR = ";";

function csvCell(value: string | number | null | undefined): string {
  const s: string = value == null ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text with a BOM so Excel reads Cyrillic correctly. */
export function buildCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(CSV_SEPARATOR)).join("\r\n") + "\r\n";
}

/** Parse CSV saved by Excel (separator «;», «,» or tab — guessed from the first line). */
export function parseCsv(text: string): string[][] {
  const src: string = text.replace(/^﻿/, "");
  const firstLine: string = src.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [";", ",", "\t"].map((sep) => [sep, firstLine.split(sep).length]);
  counts.sort((a, b) => b[1] - a[1]);
  const sep: string = counts[0]![0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch: string = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Counted quantities from an uploaded count sheet: the column whose header is
 * the SKU and the column of the count. Returns `sku → raw counted text` for
 * rows where the count cell is filled in.
 */
export function countsFromCsv(
  rows: readonly (readonly string[])[],
  headers: { sku: readonly string[]; counted: readonly string[] },
): Map<string, string> | null {
  if (rows.length === 0) return null;
  const norm = (s: string): string => s.trim().toLowerCase();
  const head: string[] = rows[0]!.map(norm);
  const skuCol: number = head.findIndex((h) => headers.sku.map(norm).includes(h));
  const countCol: number = head.findIndex((h) => headers.counted.map(norm).includes(h));
  if (skuCol < 0 || countCol < 0) return null;
  const out = new Map<string, string>();
  for (const r of rows.slice(1)) {
    const sku: string = (r[skuCol] ?? "").trim();
    const counted: string = (r[countCol] ?? "").trim();
    if (sku && counted) out.set(sku, counted);
  }
  return out;
}

/** One line of the count sheet (GET /api/admin/stock/stocktake). */
export type StocktakeRowJson = {
  variantId: string;
  categoryCode: string;
  categoryNameRo: string;
  categoryNameRu: string;
  categoryNameEn: string;
  unit: string;
  itemSku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  /** Variant label (colour / size); null for a single plain variant. */
  label: string | null;
  sku: string;
  /** Item photo (public URL), null when none. */
  imagePublicUrl: string | null;
  stockQuantity: number;
  isActive: boolean;
};
