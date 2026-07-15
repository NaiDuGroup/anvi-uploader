import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEFacturaClient, isEFacturaLive } from "./index";
import {
  EFACTURA_STATUS,
  ISSUED_EFACTURA_STATUSES,
  type EFacturaInvoice,
} from "./types";
import { extractInvoiceRefs } from "@/lib/reconciliation/match";
import { STATEMENT_EFACTURA_STATUSES } from "@/lib/reconciliation/autoMatch";
import { parseEFacturaGridHtml, type ParsedGridInvoice } from "./parseGridHtml";
import { parseEFacturaCsv } from "./parseAcceptedCsv";
import { parseInvoiceXml } from "./parseInvoiceXml";

export interface FiscalSyncResult {
  fetched: number;
  upserted: number;
  linkedClients: number;
  linkedInvoices: number;
}

/**
 * Upserts one fiscal invoice into our DB with best-effort client linking
 * (buyer IDNO → StudioCustomer.companyIdno). Cont spre plata is intentionally
 * not linked — Cont is an offer document, independent of e-Factura.
 */
export async function upsertFiscalInvoiceRecord(
  fi: EFacturaInvoice,
  options?: {
    /**
     * Portal import has no reliable InvoiceStatus — keep an existing row's
     * status (SOAP/detail may have set rejected/cancelled). Create still uses
     * `fi.status` (neutral SIGNED_BUYER).
     */
    preserveStatusOnUpdate?: boolean;
  },
): Promise<{ linkedClient: boolean; linkedInvoice: boolean }> {
  let clientId: string | null = null;
  if (fi.buyerIdno) {
    const studioClient = await prisma.studioCustomer.findFirst({
      where: { companyIdno: fi.buyerIdno },
      select: { id: true },
    });
    if (studioClient) clientId = studioClient.id;
  }

  // Full payload used only when CREATING a new row.
  const createData = {
    eFacturaStatus: fi.status,
    issueDate: fi.issueDate ? new Date(fi.issueDate) : null,
    totalAmount: fi.totalAmount ?? null,
    vatAmount: fi.vatAmount ?? null,
    currency: fi.currency,
    buyerName: fi.buyerName,
    buyerIdno: fi.buyerIdno,
    ...(fi.redirections !== undefined
      ? { redirections: fi.redirections ?? null }
      : {}),
    rawPayload: (fi.raw ?? undefined) as Prisma.InputJsonValue | undefined,
    lastSyncedAt: new Date(),
  };

  // Fiscal receipt (Bon Fiscal / B/f): the invoice was collected at the POS, so
  // mark it paid at the receipt date and record how (card/cash). Only the
  // per-invoice XML source carries this; list/CSV sources leave it undefined.
  const receiptData = fi.settledByReceipt
    ? {
        receiptRef: fi.receiptRef ?? null,
        receiptMethod: fi.receiptMethod ?? null,
        receiptSettledAt: fi.receiptDate
          ? new Date(fi.receiptDate)
          : fi.issueDate
            ? new Date(fi.issueDate)
            : new Date(),
        paidAt: fi.receiptDate
          ? new Date(fi.receiptDate)
          : fi.issueDate
            ? new Date(fi.issueDate)
            : new Date(),
      }
    : {};

  // The XML pull is the only source that carries receipt/attached-document data,
  // so a defined `settledByReceipt` flag also means the details were fetched.
  const detailsFetched = fi.settledByReceipt !== undefined
    ? { detailsFetchedAt: new Date() }
    : {};

  const writeStatus =
    !options?.preserveStatusOnUpdate &&
    Number.isFinite(fi.status) &&
    fi.status !== EFACTURA_STATUS.DRAFT;

  // Merge-only update: a sparse source (e.g. the SOAP accepted-invoices list,
  // which omits buyer/amounts) must NEVER blank out details that a portal import
  // or per-invoice fetch already filled, nor downgrade a real status to Draft(0).
  const updateData: Prisma.FiscalInvoiceUpdateInput = {
    lastSyncedAt: new Date(),
    ...(writeStatus ? { eFacturaStatus: fi.status } : {}),
    ...(fi.issueDate ? { issueDate: new Date(fi.issueDate) } : {}),
    ...(fi.totalAmount != null ? { totalAmount: fi.totalAmount } : {}),
    ...(fi.vatAmount != null ? { vatAmount: fi.vatAmount } : {}),
    ...(fi.buyerName ? { buyerName: fi.buyerName } : {}),
    ...(fi.buyerIdno ? { buyerIdno: fi.buyerIdno } : {}),
    ...(fi.redirections !== undefined
      ? { redirections: fi.redirections ?? null }
      : {}),
    ...(fi.raw ? { rawPayload: fi.raw as Prisma.InputJsonValue } : {}),
    ...receiptData,
    ...detailsFetched,
    // Never clobber a resolved client link with null.
    ...(clientId ? { clientId } : {}),
  };

  await prisma.fiscalInvoice.upsert({
    where: { seria_number: { seria: fi.seria, number: fi.number } },
    create: {
      seria: fi.seria,
      number: fi.number,
      buyerSnapshot: fi.buyerName
        ? ({ name: fi.buyerName, idno: fi.buyerIdno } as Prisma.InputJsonValue)
        : undefined,
      clientId,
      invoiceId: null,
      ...createData,
      ...receiptData,
      ...detailsFetched,
    },
    update: updateData,
  });

  return { linkedClient: !!clientId, linkedInvoice: false };
}

/**
 * Inserts an identity-only fiscal invoice (seria/number/status) discovered via
 * enumeration. Does NOT touch buyer/amount so a later detail pull can enrich it,
 * and never downgrades an already-enriched record. Returns true if newly created.
 */
export async function upsertFiscalInvoiceIdentity(
  seria: string,
  number: string,
  eFacturaStatus: number,
  issueDate: string | null,
): Promise<boolean> {
  const existing = await prisma.fiscalInvoice.findUnique({
    where: { seria_number: { seria, number } },
    select: { id: true },
  });
  if (existing) {
    await prisma.fiscalInvoice.update({
      where: { seria_number: { seria, number } },
      data: { eFacturaStatus, lastSyncedAt: new Date() },
    });
    return false;
  }
  await prisma.fiscalInvoice.create({
    data: {
      seria,
      number,
      eFacturaStatus,
      issueDate: issueDate ? new Date(issueDate) : null,
      currency: "MDL",
      lastSyncedAt: new Date(),
    },
  });
  return true;
}

/**
 * Enumerates archived (historical) invoices and mirrors their IDENTITY into the
 * DB. Amounts/buyer stay null until a detail pull enriches them (kept separate
 * because that is ~1 API call per invoice and we want the fast list first).
 */
function fiscalKey(seria: string, number: string): string {
  return `${seria.toUpperCase()}|${number}`;
}

export async function syncArchivedInvoices(options?: {
  issuedFrom?: Date;
  issuedTo?: Date;
}): Promise<{ listed: number; created: number; keys: Set<string> }> {
  const client = getEFacturaClient();
  const keys = new Set<string>();
  if (!client.listArchivedInvoices) return { listed: 0, created: 0, keys };

  const invoices = await client.listArchivedInvoices(options);
  let created = 0;
  for (const fi of invoices) {
    if (!fi.seria || !fi.number) continue;
    keys.add(fiscalKey(fi.seria, fi.number));
    const isNew = await upsertFiscalInvoiceIdentity(
      fi.seria,
      fi.number,
      fi.status,
      fi.issueDate,
    );
    if (isNew) created++;
  }
  return { listed: invoices.length, created, keys };
}

/**
 * Re-fetches InvoiceStatus for issued invoices that disappeared from the
 * accepted + archive lists (typically buyer-rejected / supplier-cancelled).
 * Bounded so a sync stays within serverless time limits.
 */
export async function refreshMissingInvoiceStatuses(
  seenKeys: Set<string>,
  options?: { limit?: number; delayMs?: number },
): Promise<{ checked: number; updated: number; dead: number }> {
  const limit = options?.limit ?? 40;
  const delayMs = options?.delayMs ?? 400;
  const client = getEFacturaClient();

  // Prefer "sent" (awaiting buyer) — most likely to move to rejected/cancelled.
  const candidates = await prisma.fiscalInvoice.findMany({
    where: {
      eFacturaStatus: { in: [...ISSUED_EFACTURA_STATUSES] },
    },
    orderBy: [
      { eFacturaStatus: "asc" }, // 1,3,6,7,8,10 — 7 Sent near the middle; boost below
      { lastSyncedAt: "asc" },
    ],
    select: {
      id: true,
      seria: true,
      number: true,
      eFacturaStatus: true,
    },
    take: 500,
  });

  const missing = candidates
    .filter((row) => !seenKeys.has(fiscalKey(row.seria, row.number)))
    .sort((a, b) => {
      // Sent-to-buyer first, then everything else by lastSynced (already approx).
      const rank = (s: number) => (s === EFACTURA_STATUS.SENT_TO_BUYER ? 0 : 1);
      return rank(a.eFacturaStatus) - rank(b.eFacturaStatus);
    })
    .slice(0, limit);

  let updated = 0;
  let dead = 0;

  for (const inv of missing) {
    const candidatesNums = [inv.number];
    if (inv.number.length < 9) {
      candidatesNums.push(inv.number.padStart(9, "0"));
    }

    let found: EFacturaInvoice | null = null;
    for (const num of candidatesNums) {
      try {
        found = await client.getInvoiceBySeriaNumber(inv.seria, num);
      } catch {
        found = null;
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (found) break;
    }

    if (!found || !Number.isFinite(found.status) || found.status === inv.eFacturaStatus) {
      // Still touch lastSyncedAt so we rotate through the stale set over time.
      await prisma.fiscalInvoice.update({
        where: { id: inv.id },
        data: { lastSyncedAt: new Date() },
      });
      continue;
    }

    await upsertFiscalInvoiceRecord(found);
    updated++;
    if (
      found.status === EFACTURA_STATUS.REJECTED_BUYER ||
      found.status === EFACTURA_STATUS.CANCELLED_SUPPLIER
    ) {
      dead++;
    }
  }

  return { checked: missing.length, updated, dead };
}

/** Portal «Отправлено» / «Завершённые» (+ nearby issued) via SearchInvoices. */
const SEARCH_DISCOVER_STATUSES = [
  EFACTURA_STATUS.SENT_TO_BUYER,
  EFACTURA_STATUS.SIGNED_BUYER,
  EFACTURA_STATUS.ACCEPTED_BUYER,
  EFACTURA_STATUS.TRANSPORTED,
] as const;

/**
 * Discovers Sent/Completed identities via `SearchInvoices` (status filter).
 * SOAP still returns no buyer/amounts — enrich fills those later.
 */
async function syncIssuedViaSearch(): Promise<{
  listed: number;
  upserted: number;
  keys: Set<string>;
}> {
  const client = getEFacturaClient();
  const keys = new Set<string>();
  if (!client.searchInvoices) return { listed: 0, upserted: 0, keys };

  // Prefer a StartDate so the service does not try to return unbounded history.
  const issuedFrom = new Date();
  issuedFrom.setFullYear(issuedFrom.getFullYear() - 3);

  let listed = 0;
  let upserted = 0;
  for (const status of SEARCH_DISCOVER_STATUSES) {
    let found: Awaited<ReturnType<NonNullable<typeof client.searchInvoices>>>;
    try {
      found = await client.searchInvoices({
        invoiceStatus: status,
        issuedFrom,
      });
    } catch (err) {
      console.warn(
        `SearchInvoices status=${status} failed:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    for (const fi of found) {
      if (!fi.seria || !fi.number) continue;
      listed++;
      keys.add(fiscalKey(fi.seria, fi.number));
      await upsertFiscalInvoiceRecord(fi);
      upserted++;
    }
  }
  return { listed, upserted, keys };
}

/**
 * Pulls supplier-side fiscal invoices from e-Factura and mirrors them into the
 * `FiscalInvoice` table:
 *  1. accepted queue (`GetAcceptedInvoices`);
 *  2. Search by status (Sent / Signed buyer / …) — discover portal folders;
 *  3. archive pages (`GetArchivedInvoices`);
 *  4. status refresh for rows that left those lists (rejected/cancelled).
 * Amounts/buyer still come from XML enrich (`GetInvoicesBySeriaNumber`).
 */
export async function syncFiscalInvoices(): Promise<
  FiscalSyncResult & {
    archivedListed: number;
    archivedCreated: number;
    searchedListed: number;
    searchedUpserted: number;
    statusChecked: number;
    statusUpdated: number;
    markedDead: number;
  }
> {
  const client = getEFacturaClient();
  const invoices = await client.listSupplierInvoices();
  const seenKeys = new Set<string>();

  let upserted = 0;
  let linkedClients = 0;
  let linkedInvoices = 0;

  for (const fi of invoices) {
    if (!fi.seria || !fi.number) continue;
    seenKeys.add(fiscalKey(fi.seria, fi.number));
    const { linkedClient, linkedInvoice } = await upsertFiscalInvoiceRecord(fi);
    if (linkedClient) linkedClients++;
    if (linkedInvoice) linkedInvoices++;
    upserted++;
  }

  const searched = await syncIssuedViaSearch();
  for (const key of searched.keys) seenKeys.add(key);

  const archived = await syncArchivedInvoices();
  for (const key of archived.keys) seenKeys.add(key);

  const statusRefresh = await refreshMissingInvoiceStatuses(seenKeys);

  return {
    fetched: invoices.length,
    upserted,
    linkedClients,
    linkedInvoices,
    archivedListed: archived.listed,
    archivedCreated: archived.created,
    searchedListed: searched.listed,
    searchedUpserted: searched.upserted,
    statusChecked: statusRefresh.checked,
    statusUpdated: statusRefresh.updated,
    markedDead: statusRefresh.dead,
  };
}

export interface GridImportResult {
  reportedTotal: number | null;
  parsed: number;
  created: number;
  updated: number;
  linkedClients: number;
  linkedInvoices: number;
}

/**
 * Upserts parsed portal invoices (full buyer + amounts). Portal folders are
 * irrelevant: new rows get neutral "issued" (SIGNED_BUYER); updates never
 * overwrite an existing InvoiceStatus (SOAP/detail owns rejected/cancelled).
 */
async function importParsedInvoices(
  invoices: ParsedGridInvoice[],
  reportedTotal: number | null,
  source: string,
): Promise<GridImportResult> {
  let created = 0;
  let updated = 0;
  let linkedClients = 0;
  let linkedInvoices = 0;

  for (const row of invoices) {
    const existing = await prisma.fiscalInvoice.findUnique({
      where: { seria_number: { seria: row.seria, number: row.number } },
      select: { id: true },
    });

    const fi: EFacturaInvoice = {
      seria: row.seria,
      number: row.number,
      status: EFACTURA_STATUS.SIGNED_BUYER,
      issueDate: row.issueDate,
      totalAmount: row.totalAmount,
      vatAmount: row.vatAmount,
      currency: "MDL",
      buyerName: row.buyerName,
      buyerIdno: row.buyerIdno,
      raw: { source, oid: row.oid },
    };

    const { linkedClient, linkedInvoice } = await upsertFiscalInvoiceRecord(fi, {
      preserveStatusOnUpdate: true,
    });
    if (existing) updated++;
    else created++;
    if (linkedClient) linkedClients++;
    if (linkedInvoice) linkedInvoices++;
  }

  return {
    reportedTotal,
    parsed: invoices.length,
    created,
    updated,
    linkedClients,
    linkedInvoices,
  };
}

/**
 * Imports fiscal invoices pasted from the SFS e-Factura WEB PORTAL grid HTML.
 * Full buyer + amounts the SOAP API omits.
 */
export async function importPortalGridInvoices(
  html: string,
): Promise<GridImportResult> {
  const { invoices, reportedTotal } = parseEFacturaGridHtml(html);
  return importParsedInvoices(invoices, reportedTotal, "portal-grid");
}

/**
 * Imports fiscal invoices from the portal "Registrul FF" CSV export (delimiter
 * ';'). Same target as the grid import; preferred for bulk (one file = all).
 */
export async function importPortalCsvInvoices(
  content: string,
): Promise<GridImportResult> {
  const { invoices, reportedTotal } = parseEFacturaCsv(content);
  return importParsedInvoices(invoices, reportedTotal, "portal-csv");
}

export interface PullFromReferencesResult {
  scannedTransactions: number;
  tokensSeen: number;
  fetched: number;
  notFound: number;
  errors: number;
}

/** Splits a fiscal token like "EBJ000662654" into series + number. */
function splitFiscalToken(token: string): { seria: string; number: string } | null {
  const m = token.match(/^([A-Za-z]{2,4})(\d{4,})$/);
  if (!m) return null;
  return { seria: m[1].toUpperCase(), number: m[2] };
}

/**
 * "Pull-on-reference": scans incoming bank transactions, extracts the fiscal
 * invoice numbers customers cite in the payment purpose, and fetches those
 * invoices from e-Factura (with full buyer + amount data) if we don't have them
 * yet. Deliberately gentle on the SFS server: one request at a time with a small
 * delay, since it throttles rapid callers.
 */
export async function pullInvoicesFromBankReferences(options?: {
  statementId?: string;
  delayMs?: number;
}): Promise<PullFromReferencesResult> {
  const delayMs = options?.delayMs ?? 400;
  const client = getEFacturaClient();

  const txs = await prisma.bankTransaction.findMany({
    where: {
      direction: "CREDIT",
      matchStatus: { in: ["UNMATCHED", "SUGGESTED"] },
      ...(options?.statementId ? { statementId: options.statementId } : {}),
    },
    select: { purpose: true },
  });

  // Collect unique e-Factura tokens only (skip paper FF like AAQ4557640 — not on SFS).
  const tokens = new Set<string>();
  for (const tx of txs) {
    const refs = extractInvoiceRefs(tx.purpose);
    for (const tok of refs.fiscalTokens) tokens.add(tok);
  }

  let fetched = 0;
  let notFound = 0;
  let errors = 0;

  for (const token of tokens) {
    const parts = splitFiscalToken(token);
    if (!parts) continue;

    // Skip if we already mirror this invoice.
    const existing = await prisma.fiscalInvoice.findUnique({
      where: { seria_number: { seria: parts.seria, number: parts.number } },
      select: { id: true },
    });
    if (existing) continue;

    // Try as-is, then zero-padded to 9 digits (SFS numbers are typically 9).
    const candidates = [parts.number];
    if (parts.number.length < 9) candidates.push(parts.number.padStart(9, "0"));

    let found: EFacturaInvoice | null = null;
    for (const num of candidates) {
      try {
        found = await client.getInvoiceBySeriaNumber(parts.seria, num);
      } catch {
        errors++;
        found = null;
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (found) break;
    }

    if (!found || !found.seria || !found.number) {
      notFound++;
      continue;
    }
    await upsertFiscalInvoiceRecord(found);
    fetched++;
  }

  return {
    scannedTransactions: txs.length,
    tokensSeen: tokens.size,
    fetched,
    notFound,
    errors,
  };
}

export interface EnrichDetailsResult {
  processed: number;
  /** Invoices found to be settled by a fiscal receipt (B/f) during this run. */
  settledFound: number;
  /** Invoices skipped for retry due to a transient error (rate limit, etc.). */
  retryLater: number;
  /** Invoices still awaiting detail enrichment after this run. */
  remaining: number;
}

/**
 * Idempotent detail enrichment: pulls the full invoice XML for invoices that
 * have not been fetched yet (`detailsFetchedAt IS NULL`) and, crucially,
 * detects the "Путевой лист" fiscal-receipt reference ("B/f ... (card)") that
 * only the XML carries — marking such invoices paid at the POS terminal.
 *
 * Processes a bounded chunk per call so it fits within a serverless timeout and
 * is safe to re-run (a completed invoice is never re-fetched). Transient errors
 * (SFS throttling) leave `detailsFetchedAt` null so the next run retries them.
 */
export async function enrichFiscalInvoiceDetails(options?: {
  limit?: number;
  delayMs?: number;
}): Promise<EnrichDetailsResult> {
  const limit = options?.limit ?? 50;
  const delayMs = options?.delayMs ?? 400;
  const client = getEFacturaClient();

  const pending = await prisma.fiscalInvoice.findMany({
    where: {
      detailsFetchedAt: null,
      eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
    },
    orderBy: [
      { issueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    take: limit,
    select: { id: true, seria: true, number: true, issueDate: true },
  });

  let processed = 0;
  let settledFound = 0;
  let retryLater = 0;

  for (const inv of pending) {
    // SFS numbers are typically 9 digits; try as-is, then zero-padded.
    const candidates = [inv.number];
    if (inv.number.length < 9) candidates.push(inv.number.padStart(9, "0"));

    let found: EFacturaInvoice | null = null;
    let errored = false;
    for (const num of candidates) {
      try {
        found = await client.getInvoiceBySeriaNumber(inv.seria, num);
      } catch {
        errored = true;
        found = null;
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (found) break;
    }

    // Transient failure with no result: leave it for the next run.
    if (!found && errored) {
      retryLater++;
      continue;
    }

    const data: Prisma.FiscalInvoiceUpdateInput = {
      detailsFetchedAt: new Date(),
      lastSyncedAt: new Date(),
    };
    if (found) {
      // Always persist InvoiceStatus from detail pull (incl. rejected/cancelled).
      if (
        Number.isFinite(found.status) &&
        found.status !== EFACTURA_STATUS.DRAFT
      ) {
        data.eFacturaStatus = found.status;
      }
      if (found.issueDate) {
        const issued = new Date(found.issueDate);
        if (!Number.isNaN(issued.getTime())) data.issueDate = issued;
      }
      if (found.totalAmount != null) data.totalAmount = found.totalAmount;
      if (found.vatAmount != null) data.vatAmount = found.vatAmount;
      if (found.buyerName) data.buyerName = found.buyerName;
      if (found.buyerIdno) data.buyerIdno = found.buyerIdno;
      if (found.redirections !== undefined) {
        data.redirections = found.redirections ?? null;
      }
      if (found.raw) data.rawPayload = found.raw as Prisma.InputJsonValue;
      if (found.settledByReceipt) {
        const settledAt = found.receiptDate
          ? new Date(found.receiptDate)
          : inv.issueDate ?? new Date();
        data.receiptRef = found.receiptRef ?? null;
        data.receiptMethod = found.receiptMethod ?? null;
        data.receiptSettledAt = settledAt;
        data.paidAt = settledAt;
        settledFound++;
      }
    }
    await prisma.fiscalInvoice.update({ where: { id: inv.id }, data });
    processed++;
  }

  const remaining = await prisma.fiscalInvoice.count({
    where: {
      detailsFetchedAt: null,
      eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
    },
  });

  return { processed, settledFound, retryLater, remaining };
}

/**
 * AttachedDocuments / Notes text looks like a POS receipt (b/f, bon, cec,
 * numerar, card) — same idea as `interpretReceipt`, scoped to those tags so
 * unrelated XML words (and plain "act din …" attachments) do not match.
 */
const RECEIPT_CANDIDATE_SQL = Prisma.sql`
  receipt_settled_at IS NULL
  AND raw_payload IS NOT NULL
  AND (
    raw_payload::text ~* '<AttachedDocuments[^>]*>[^<]*(b[[:space:]]*/?[[:space:]]*f|[[:<:]]bon[[:>:]]|[[:<:]]cec[[:>:]]|[[:<:]]numerar[[:>:]]|[[:<:]]card[[:>:]])'
    OR raw_payload::text ~* '<Notes[^>]*>[^<]*(b[[:space:]]*/?[[:space:]]*f|[[:<:]]bon[[:>:]]|[[:<:]]cec[[:>:]]|[[:<:]]numerar[[:>:]]|[[:<:]]card[[:>:]])'
  )
`;

/** How many stored XMLs still look like unsettled B/f / bon / cec / card. */
export async function countReprocessableReceipts(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS count
    FROM fiscal_invoices
    WHERE ${RECEIPT_CANDIDATE_SQL}
  `);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Re-parses receipt markers from already-stored invoice XML — no SFS calls.
 *
 * Details for many invoices were fetched before the parser learned to read
 * `<AttachedDocuments>` / `<Notes>` (b/f / bon / cec / numerar / card), so
 * their XML is on hand but was never interpreted as a POS settlement. This
 * pass scans the stored payloads and marks such invoices paid. Idempotent:
 * only rows that are a receipt but not yet flagged (`receiptSettledAt IS NULL`)
 * are updated.
 */
export async function reprocessStoredReceipts(): Promise<{
  scanned: number;
  settled: number;
}> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; issue_date: Date | null; raw_payload: string }>
  >(Prisma.sql`
    SELECT id, issue_date, raw_payload::text AS raw_payload
    FROM fiscal_invoices
    WHERE ${RECEIPT_CANDIDATE_SQL}
  `);

  let settled = 0;
  for (const row of rows) {
    let xml = row.raw_payload;
    // The JSON column stores the XML as a JSON string, so `::text` yields a
    // quoted/escaped literal — decode it back to raw XML before parsing.
    try {
      const decoded = JSON.parse(xml);
      if (typeof decoded === "string") xml = decoded;
    } catch {
      // already raw
    }
    const parsed = parseInvoiceXml(xml);
    if (!parsed.settledByReceipt) continue;
    const settledAt = parsed.receiptDate
      ? new Date(parsed.receiptDate)
      : row.issue_date ?? new Date();
    await prisma.fiscalInvoice.update({
      where: { id: row.id },
      data: {
        receiptRef: parsed.receiptRef,
        receiptMethod: parsed.receiptMethod,
        receiptSettledAt: settledAt,
        paidAt: settledAt,
      },
    });
    settled++;
  }

  return { scanned: rows.length, settled };
}

/**
 * Fills `issueDate` from already-stored XML when enrich previously saved
 * buyer/amounts but forgot IssuedDate (no SFS call).
 */
export async function backfillIssueDatesFromStoredXml(options?: {
  limit?: number;
}): Promise<{ scanned: number; filled: number }> {
  const limit = options?.limit ?? 500;
  const rows = await prisma.fiscalInvoice.findMany({
    where: {
      issueDate: null,
      rawPayload: { not: Prisma.DbNull },
    },
    select: { id: true, rawPayload: true },
    take: limit,
  });

  let filled = 0;
  for (const row of rows) {
    let xml: string | null = null;
    const raw = row.rawPayload;
    if (typeof raw === "string") {
      xml = raw;
    } else if (raw != null) {
      try {
        const asText = JSON.stringify(raw);
        // JSON column may store the XML as a JSON string value.
        const decoded = typeof raw === "object" ? raw : JSON.parse(asText);
        xml = typeof decoded === "string" ? decoded : asText;
      } catch {
        xml = String(raw);
      }
    }
    if (!xml || !xml.includes("IssuedDate")) continue;
    const parsed = parseInvoiceXml(xml);
    if (!parsed.issueDate) continue;
    const issued = new Date(parsed.issueDate);
    if (Number.isNaN(issued.getTime())) continue;
    await prisma.fiscalInvoice.update({
      where: { id: row.id },
      data: { issueDate: issued },
    });
    filled++;
  }
  return { scanned: rows.length, filled };
}

/**
 * After sync / portal import: interpret B/f in already-stored XML, then pull a
 * bounded chunk of missing invoice XMLs from SFS (when live).
 */
export async function runPostIngestEnrichment(options?: {
  enrichLimit?: number;
}): Promise<{
  reprocessedSettled: number;
  enrichProcessed: number;
  enrichRemaining: number;
}> {
  await backfillIssueDatesFromStoredXml();
  const reprocessed = await reprocessStoredReceipts();
  const enrichLimit = options?.enrichLimit ?? 30;

  if (!isEFacturaLive()) {
    return {
      reprocessedSettled: reprocessed.settled,
      enrichProcessed: 0,
      enrichRemaining: await countReprocessableReceipts(),
    };
  }

  const pendingFetch = await prisma.fiscalInvoice.count({
    where: {
      detailsFetchedAt: null,
      eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
    },
  });

  if (pendingFetch === 0) {
    return {
      reprocessedSettled: reprocessed.settled,
      enrichProcessed: 0,
      enrichRemaining: await countReprocessableReceipts(),
    };
  }

  const enrich = await enrichFiscalInvoiceDetails({ limit: enrichLimit });
  return {
    reprocessedSettled: reprocessed.settled,
    enrichProcessed: enrich.processed,
    enrichRemaining: enrich.remaining + (await countReprocessableReceipts()),
  };
}
