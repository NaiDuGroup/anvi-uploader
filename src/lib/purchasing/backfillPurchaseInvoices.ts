import { prisma } from "@/lib/prisma";
import { EFACTURA_STATUS, getEFacturaBuyerClient, type EFacturaClient } from "@/lib/efactura";
import { parseInvoiceXml } from "@/lib/efactura/parseInvoiceXml";
import { PurchaseSyncFailure } from "./dto";
import { classifySyncFailure } from "./syncFailure";
import {
  DEFAULT_LOOKBACK_DAYS,
  discoverPurchaseInvoices,
  purchaseHeaderFromXml,
  type InvoiceIdentity,
} from "./syncPurchaseInvoices";
import { PurchaseInvoiceStatus } from "./types";

const DAY_MS = 86_400_000;

/**
 * Buyer-side statuses that mean a live purchase document (same idea as
 * `ISSUED_EFACTURA_STATUSES` on the sales side; 1 «signed by supplier» is not
 * visible to the buyer yet, 0/2/5 are draft/rejected/cancelled).
 */
export const BACKFILL_STATUSES: readonly number[] = [
  EFACTURA_STATUS.ACCEPTED_BUYER,
  EFACTURA_STATUS.ARCHIVED,
  EFACTURA_STATUS.SENT_TO_BUYER,
  EFACTURA_STATUS.SIGNED_BUYER,
  EFACTURA_STATUS.TRANSPORTED,
];

/** Leaves headroom under the route's 300 s `maxDuration`. */
const DEFAULT_BUDGET_MS = 240_000;
const DEFAULT_MAX_DETAILS = 400;

export interface BackfillChunk {
  from: Date;
  to: Date;
}

/** Splits [from, to) into calendar quarters (UTC) — one SearchInvoices range each. */
export function quarterChunks(from: Date, to: Date): BackfillChunk[] {
  const chunks: BackfillChunk[] = [];
  let cursor = new Date(from.getTime());
  while (cursor < to) {
    const qStartMonth = Math.floor(cursor.getUTCMonth() / 3) * 3;
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), qStartMonth + 3, 1));
    const end = next < to ? next : to;
    chunks.push({ from: cursor, to: end });
    cursor = end;
  }
  return chunks;
}

/**
 * Latest issue date the backfill may mark as history: anything newer belongs
 * to the normal sync window and must keep flowing into the stock review.
 */
export function backfillCutoff(now: Date, requested?: Date | null): Date {
  const windowStart = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * DAY_MS);
  if (!requested || requested > windowStart) return windowStart;
  return requested;
}

export interface BackfillResult {
  skipped: "efactura_mock" | null;
  from: string;
  /** Effective end of the range (clamped to the cut-off). */
  to: string;
  chunks: number;
  discovered: number;
  /** New rows stored as history. */
  created: number;
  /** Existing rows whose e-Factura status changed (never downgraded otherwise). */
  statusUpdated: number;
  detailsFetched: number;
  failedDetails: number;
  /** History rows still without totals — call again to continue. */
  remainingDetails: number;
  /** Discovery calls that failed (chunk + status); retry the same range. */
  errors: string[];
  /** True when the time budget ran out before discovery finished. */
  timedOut: boolean;
}

function key(seria: string, number: string): string {
  return `${seria}\u0000${number}`;
}

/**
 * Imports purchase invoice history (we are the buyer) for balances: invoice
 * identities per quarter, then totals from each invoice XML.
 *
 * New rows are stored `historical` with status `ignored` and WITHOUT lines,
 * so they never enter «Требуют разбора», auto-posting or supplier-mapping
 * learning. Rows that already exist keep their status and lines. Idempotent:
 * call again with the same range until `remainingDetails` is 0.
 */
export async function backfillPurchaseInvoices(options: {
  from: Date;
  to: Date;
  now?: Date;
  budgetMs?: number;
  maxDetails?: number;
  client?: EFacturaClient | null;
}): Promise<BackfillResult> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const outOfTime = (): boolean => Date.now() - startedAt > budgetMs;
  const now = options.now ?? new Date();
  const to = backfillCutoff(now, options.to);
  const from = options.from;

  const result: BackfillResult = {
    skipped: null,
    from: from.toISOString(),
    to: to.toISOString(),
    chunks: 0,
    discovered: 0,
    created: 0,
    statusUpdated: 0,
    detailsFetched: 0,
    failedDetails: 0,
    remainingDetails: 0,
    errors: [],
    timedOut: false,
  };

  const client = options.client === undefined ? getEFacturaBuyerClient() : options.client;
  if (!client) return { ...result, skipped: "efactura_mock" };

  // 1. Discovery — identity only, cheap (one call per quarter and status).
  const found = new Map<string, InvoiceIdentity>();
  const chunks = from < to ? quarterChunks(from, to) : [];
  result.chunks = chunks.length;
  outer: for (const chunk of chunks) {
    for (const status of BACKFILL_STATUSES) {
      if (outOfTime()) {
        result.timedOut = true;
        break outer;
      }
      try {
        const rows = await discoverPurchaseInvoices(client, {
          issuedFrom: chunk.from,
          // SearchInvoices treats EndDate as inclusive; stop 1 ms short.
          issuedTo: new Date(chunk.to.getTime() - 1),
          statuses: [status],
        });
        for (const r of rows) found.set(key(r.seria, r.number), r);
      } catch (err) {
        if (classifySyncFailure(err) === PurchaseSyncFailure.DatabaseSchemaOutdated) throw err;
        const label = `${chunk.from.toISOString().slice(0, 10)}..${chunk.to.toISOString().slice(0, 10)} status ${status}`;
        console.error(`purchase backfill: discovery ${label}:`, err);
        result.errors.push(label);
      }
    }
  }
  result.discovered = found.size;

  if (found.size > 0) {
    const existing = await prisma.purchaseInvoice.findMany({
      select: { id: true, seria: true, number: true, eFacturaStatus: true },
    });
    const byKey = new Map(existing.map((e) => [key(e.seria, e.number), e]));
    const fresh: InvoiceIdentity[] = [];
    for (const [k, id] of found) {
      const row = byKey.get(k);
      if (!row) {
        fresh.push(id);
      } else if (row.eFacturaStatus !== id.status) {
        await prisma.purchaseInvoice.update({
          where: { id: row.id },
          data: { eFacturaStatus: id.status, lastSyncedAt: new Date() },
        });
        result.statusUpdated += 1;
      }
    }
    if (fresh.length > 0) {
      const created = await prisma.purchaseInvoice.createMany({
        data: fresh.map((id) => ({
          seria: id.seria,
          number: id.number,
          eFacturaStatus: id.status,
          historical: true,
          status: PurchaseInvoiceStatus.Ignored,
        })),
        skipDuplicates: true,
      });
      result.created = created.count;
    }
  }

  // 2. Totals — one XML per invoice; header only, no lines.
  const pending = await prisma.purchaseInvoice.findMany({
    where: { historical: true, detailsFetchedAt: null },
    orderBy: { lastSyncedAt: "asc" },
    select: { id: true, seria: true, number: true },
  });
  const maxDetails = options.maxDetails ?? DEFAULT_MAX_DETAILS;
  let attempted = 0;
  for (const inv of pending) {
    if (attempted >= maxDetails || outOfTime()) {
      result.timedOut = result.timedOut || outOfTime();
      break;
    }
    attempted += 1;
    try {
      const full = await client.getInvoiceBySeriaNumber(inv.seria, inv.number);
      const xml: string | null = typeof full?.raw === "string" ? full.raw : null;
      if (!xml) throw new Error("invoice XML not available");
      await prisma.purchaseInvoice.update({
        where: { id: inv.id },
        data: { ...purchaseHeaderFromXml(parseInvoiceXml(xml), xml), lastSyncedAt: new Date() },
      });
      result.detailsFetched += 1;
    } catch (err) {
      if (classifySyncFailure(err) === PurchaseSyncFailure.DatabaseSchemaOutdated) throw err;
      console.error(`purchase backfill: invoice ${inv.seria} ${inv.number}:`, err);
      result.failedDetails += 1;
      // Rotate to the back of the queue so one bad invoice cannot block the rest.
      await prisma.purchaseInvoice.update({
        where: { id: inv.id },
        data: { lastSyncedAt: new Date() },
      });
    }
  }
  result.remainingDetails = pending.length - result.detailsFetched;

  return result;
}
