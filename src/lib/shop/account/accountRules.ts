import { dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import type { CartLine } from "@/lib/storefront/cart";
import type { ShopFileRef, ShopQuoteLine } from "@/lib/storefront/types";
import { SHOP_ORDER_FILE_PREFIX } from "../constants";

/**
 * Storefront account rules. Pure (client-safe, unit-tested): which files a
 * customer may delete, the «Fișierele mele» list, and «Repetă comanda».
 */

export interface FileOrderState {
  orderNumber: number;
  status: string;
  paymentStatus: string;
  isPaid: boolean;
  deletedAt: Date | null;
}

/**
 * The studio still needs this order's files: not trashed, not delivered,
 * and paid or waiting for payment. While so, the customer cannot delete them.
 */
export function orderNeedsFiles(o: FileOrderState): boolean {
  if (o.deletedAt != null || o.status === "DELIVERED") return false;
  return o.isPaid || o.paymentStatus === "paid" || o.paymentStatus === "pending";
}

export interface CustomerFileRow {
  fileUrl: string;
  fileName: string;
  sizeBytes: number | null;
  createdAt: Date;
  order: FileOrderState;
}

export interface CustomerFile {
  key: string;
  name: string;
  sizeBytes: number | null;
  /** First order that used it. */
  createdAt: string;
  orderNumbers: number[];
  /** Order numbers in work that still need it (delete is refused). */
  inUseBy: number[];
}

/** One entry per stored object (a repeated order reuses the same key), newest first. */
export function groupCustomerFiles(rows: readonly CustomerFileRow[]): CustomerFile[] {
  const byKey = new Map<string, CustomerFile>();
  for (const r of rows) {
    if (!r.fileUrl.startsWith(SHOP_ORDER_FILE_PREFIX)) continue;
    let f = byKey.get(r.fileUrl);
    if (!f) {
      f = { key: r.fileUrl, name: r.fileName, sizeBytes: r.sizeBytes, createdAt: r.createdAt.toISOString(), orderNumbers: [], inUseBy: [] };
      byKey.set(r.fileUrl, f);
    }
    if (r.createdAt.toISOString() < f.createdAt) f.createdAt = r.createdAt.toISOString();
    if (!f.orderNumbers.includes(r.order.orderNumber)) f.orderNumbers.push(r.order.orderNumber);
    if (orderNeedsFiles(r.order) && !f.inUseBy.includes(r.order.orderNumber)) f.inUseBy.push(r.order.orderNumber);
  }
  const out = [...byKey.values()];
  for (const f of out) {
    f.orderNumbers.sort((a, b) => b - a);
    f.inUseBy.sort((a, b) => b - a);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export interface RepeatSourceLine {
  shopLineData: unknown;
  files: { fileUrl: string; fileName: string; paperType: string | null; sizeBytes: number | null; metaStatus: string | null }[];
}

/** Line → product page / image, from the live catalog; null when the product is gone. */
export type RepeatLookup = (quote: ShopQuoteLine) => { slug: string; image: string | null } | null;

/** A cart line rebuilt from an order line (the client adds `id` / `addedAt`). */
export type RepeatLine = Omit<CartLine, "id" | "addedAt">;

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * «Repetă comanda»: cart lines with the same options and the same stored
 * files (`shop-orders/…` keys, reused at checkout for the signed-in owner).
 * Files already deleted (`metaStatus='missing'`) are left out and named in
 * `missingFiles`, so the cart asks for a new upload. Lines whose product the
 * catalog no longer sells are skipped (counted in `skipped`).
 */
export function buildRepeatLines(
  lines: readonly RepeatSourceLine[],
  lookup: RepeatLookup,
): { lines: RepeatLine[]; skipped: number } {
  const out: RepeatLine[] = [];
  let skipped = 0;
  for (const l of lines) {
    const d = l.shopLineData;
    if (!isObj(d) || !isObj(d.quote) || typeof d.title !== "string") {
      skipped++;
      continue;
    }
    const quote = d.quote as unknown as ShopQuoteLine;
    const where = lookup(quote);
    if (!where) {
      skipped++;
      continue;
    }
    const files: ShopFileRef[] = [];
    const missingFiles: string[] = [];
    for (const f of l.files) {
      if (f.metaStatus === "missing" || !f.fileUrl.startsWith(SHOP_ORDER_FILE_PREFIX)) {
        missingFiles.push(f.fileName);
        continue;
      }
      const zone = quote.kind === "dtf" ? dtfZoneIdFromPaperType(f.paperType) : null;
      files.push({
        fileKey: f.fileUrl,
        fileName: f.fileName,
        ...(f.sizeBytes != null ? { sizeBytes: f.sizeBytes } : {}),
        ...(zone ? { zone } : {}),
      });
    }
    out.push({
      slug: where.slug,
      title: d.title,
      optionsText: typeof d.optionsText === "string" ? d.optionsText : "",
      image: where.image,
      quote,
      files,
      ...(typeof d.note === "string" && d.note ? { note: d.note } : {}),
      lastTotal: null,
      ...(missingFiles.length ? { missingFiles } : {}),
    });
  }
  return { lines: out, skipped };
}
