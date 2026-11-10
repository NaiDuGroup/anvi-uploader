import { prisma } from "@/lib/prisma";
import { parseInvoiceXml } from "@/lib/efactura/parseInvoiceXml";
import { purchaseReceiptFromXml } from "./syncPurchaseInvoices";

export interface ReprocessReceiptsResult {
  processed: number;
  settledFound: number;
  /** Stored XMLs not checked yet (call again while > 0). */
  remaining: number;
  /** Invoices with no stored XML yet (history totals not fetched) — skipped. */
  withoutXml: number;
}

/**
 * Re-reads already stored supplier XMLs for a fiscal receipt (B/f) reference
 * and fills receipt_ref / receipt_method / receipt_settled_at. Bounded and
 * idempotent: only rows with `receipt_checked_at IS NULL` are touched, so
 * repeated calls walk the backlog and then do nothing.
 */
export async function reprocessPurchaseReceipts(options: {
  maxRows?: number;
  chunk?: number;
  timeBudgetMs?: number;
} = {}): Promise<ReprocessReceiptsResult> {
  const maxRows = Math.max(1, Math.min(options.maxRows ?? 2000, 10_000));
  const chunk = Math.max(1, Math.min(options.chunk ?? 100, 500));
  const deadline = Date.now() + (options.timeBudgetMs ?? 45_000);
  let processed = 0;
  let settledFound = 0;

  while (processed < maxRows && Date.now() < deadline) {
    const rows = await prisma.purchaseInvoice.findMany({
      where: { rawXml: { not: null }, receiptCheckedAt: null },
      orderBy: { id: "asc" },
      take: Math.min(chunk, maxRows - processed),
      select: { id: true, rawXml: true, issueDate: true },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      let data;
      try {
        data = purchaseReceiptFromXml(parseInvoiceXml(row.rawXml!), row.issueDate);
      } catch (err) {
        console.error(`reprocess receipts: invoice ${row.id}:`, err);
        data = { receiptCheckedAt: new Date() };
      }
      await prisma.purchaseInvoice.update({ where: { id: row.id }, data });
      processed += 1;
      if ("receiptSettledAt" in data && data.receiptSettledAt) settledFound += 1;
    }
  }

  const [remaining, withoutXml] = await Promise.all([
    prisma.purchaseInvoice.count({ where: { rawXml: { not: null }, receiptCheckedAt: null } }),
    prisma.purchaseInvoice.count({ where: { rawXml: null } }),
  ]);
  return { processed, settledFound, remaining, withoutXml };
}
