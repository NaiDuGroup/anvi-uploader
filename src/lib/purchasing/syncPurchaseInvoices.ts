import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EFACTURA_STATUS, getEFacturaBuyerClient, type EFacturaClient } from "@/lib/efactura";
import { parseInvoiceXml, type ParsedInvoiceXml } from "@/lib/efactura/parseInvoiceXml";
import type { PurchaseSyncResult } from "./dto";
import { normalizeLineName } from "./normalizeLineName";
import { isPriceDriftSuspicious } from "./invoiceStatus";
import { purchaseCostsIncludeVat } from "./purchaseCostBasis";
import { PostLineFailure, postPurchaseLine, refreshInvoiceStatus, supplierKey } from "./postPurchaseLine";
import { findUnlinkedReceipts } from "./receiptLinking";
import {
  AUTO_POST_CONFIRMATIONS,
  isPostableKind,
  isStockTargetKind,
  PurchaseLineStatus,
  stockQuantityFromInvoice,
  StockTargetKind,
} from "./types";

/** Incoming statuses worth importing: sent to us, and signed by us. */
const INCOMING_STATUSES: readonly number[] = [
  EFACTURA_STATUS.SENT_TO_BUYER,
  EFACTURA_STATUS.SIGNED_BUYER,
];

const DEFAULT_LOOKBACK_DAYS = 45;
/** XML fetches per run — keeps a cron invocation well under its time limit. */
const MAX_DETAIL_FETCHES = 60;

function toNumber(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n: number = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function decimalOrNull(n: number | null): Prisma.Decimal | null {
  return n == null ? null : new Prisma.Decimal(n);
}

async function storeInvoiceDetails(
  invoiceId: string,
  parsed: ParsedInvoiceXml,
  xml: string,
): Promise<void> {
  const total: number | null = toNumber(parsed.totalAmount);
  const vat: number | null = toNumber(parsed.vatAmount);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseInvoice.update({
      where: { id: invoiceId },
      data: {
        supplierIdno: parsed.supplierIdno,
        supplierName: parsed.supplierName,
        issueDate: toDate(parsed.issueDate),
        deliveryDate: toDate(parsed.deliveryDate),
        totalAmount: decimalOrNull(total),
        vatAmount: decimalOrNull(vat),
        totalExVat: decimalOrNull(total != null ? total - (vat ?? 0) : null),
        rawXml: xml,
        detailsFetchedAt: new Date(),
      },
    });

    const lines = parsed.lines
      .map((l, position) => ({ l, position }))
      .filter(({ l }) => (l.name ?? "").trim() !== "");
    for (const { l, position } of lines) {
      const name: string = (l.name ?? "").trim();
      const totalExVat: number = toNumber(l.totalWithoutVat) ?? 0;
      const lineVat: number = toNumber(l.vatAmount) ?? 0;
      await tx.purchaseInvoiceLine.upsert({
        where: { invoiceId_position: { invoiceId, position } },
        create: {
          invoiceId,
          position,
          name,
          normalizedName: normalizeLineName(name),
          unit: l.unit,
          quantity: new Prisma.Decimal(toNumber(l.quantity) ?? 0),
          unitPriceExVat: decimalOrNull(toNumber(l.unitPrice)),
          totalExVat: new Prisma.Decimal(totalExVat),
          vatRate: decimalOrNull(toNumber(l.vatRate)),
          vatAmount: new Prisma.Decimal(lineVat),
          total: new Prisma.Decimal(toNumber(l.total) ?? totalExVat + lineVat),
        },
        update: {},
      });
    }
    await refreshInvoiceStatus(tx, invoiceId);
  });
}

type AutoOutcome = "posted" | "ignored" | "review";

type AutoLinkDecision = { safe: boolean; receiptId: string | null };

/**
 * Guards against double stock when the workshop already entered this delivery
 * by hand: one hand receipt with the same quantity is linked automatically,
 * anything ambiguous is left for a person to decide.
 */
async function decideAutoLink(
  kind: StockTargetKind,
  targetId: string | null,
  expectedQuantity: number,
  invoiceDate: Date,
): Promise<AutoLinkDecision> {
  if (!isPostableKind(kind) || !targetId) return { safe: true, receiptId: null };
  const receipts = await findUnlinkedReceipts(prisma, kind, targetId, invoiceDate);
  if (receipts.length === 0) return { safe: true, receiptId: null };
  const [only] = receipts;
  if (receipts.length === 1 && only && Math.abs(only.quantity - expectedQuantity) < 0.001) {
    return { safe: true, receiptId: only.id };
  }
  return { safe: false, receiptId: null };
}

/**
 * Applies remembered supplier mappings to open lines. Rules confirmed by hand
 * at least {@link AUTO_POST_CONFIRMATIONS} times post automatically; anything
 * else (new rule, price jump) is left as a suggestion for the workshop admin.
 */
async function applyMappings(invoiceId: string, costsIncludeVat: boolean): Promise<AutoOutcome[]> {
  const invoice = await prisma.purchaseInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      lines: {
        where: { status: { in: [PurchaseLineStatus.Unmatched, PurchaseLineStatus.Suggested] } },
        orderBy: { position: "asc" },
      },
    },
  });
  const supplierIdno: string = supplierKey(invoice);
  const invoiceDate: Date = invoice.deliveryDate ?? invoice.issueDate ?? invoice.createdAt;
  const outcomes: AutoOutcome[] = [];

  for (const line of invoice.lines) {
    const mapping = await prisma.supplierItemMapping.findUnique({
      where: {
        supplierIdno_normalizedName: { supplierIdno, normalizedName: line.normalizedName },
      },
    });

    const kind: StockTargetKind | null =
      mapping && isStockTargetKind(mapping.targetKind) ? mapping.targetKind : null;
    const trusted: boolean =
      mapping !== null &&
      kind !== null &&
      mapping.confirmedCount >= AUTO_POST_CONFIRMATIONS &&
      !isPriceDriftSuspicious(
        mapping.lastUnitPriceExVat != null ? Number(mapping.lastUnitPriceExVat) : null,
        line.unitPriceExVat != null ? Number(line.unitPriceExVat) : null,
      );

    const factor: number = mapping ? Number(mapping.unitsPerInvoiceUnit) : 1;
    const link: AutoLinkDecision =
      mapping && kind && trusted
        ? await decideAutoLink(
            kind,
            mapping.targetId,
            isPostableKind(kind) ? stockQuantityFromInvoice(kind, Number(line.quantity), factor) : 0,
            invoiceDate,
          )
        : { safe: false, receiptId: null };

    if (mapping && kind && trusted && link.safe) {
      try {
        const result = await postPurchaseLine({
          lineId: line.id,
          kind,
          targetId: mapping.targetId,
          unitsPerInvoiceUnit: factor,
          createdById: null,
          auto: true,
          costsIncludeVat,
          linkReceiptId: link.receiptId,
        });
        outcomes.push(result.status === PurchaseLineStatus.Ignored ? "ignored" : "posted");
        continue;
      } catch (err) {
        if (!(err instanceof PostLineFailure)) throw err;
        console.warn(`purchase auto-post skipped for line ${line.id}: ${err.code}`);
      }
    }

    const status = mapping ? PurchaseLineStatus.Suggested : PurchaseLineStatus.Unmatched;
    if (line.status !== status || line.mappingId !== (mapping?.id ?? null)) {
      await prisma.purchaseInvoiceLine.update({
        where: { id: line.id },
        data: { status, mappingId: mapping?.id ?? null },
      });
    }
    outcomes.push("review");
  }

  await prisma.$transaction((tx) => refreshInvoiceStatus(tx, invoiceId));
  return outcomes;
}

async function discover(
  client: EFacturaClient,
  issuedFrom: Date,
): Promise<Array<{ seria: string; number: string; status: number }>> {
  if (!client.searchInvoices) return [];
  const found: Array<{ seria: string; number: string; status: number }> = [];
  for (const invoiceStatus of INCOMING_STATUSES) {
    const rows = await client.searchInvoices({ invoiceStatus, issuedFrom, issuedTo: new Date() });
    for (const r of rows) {
      if (r.seria && r.number) found.push({ seria: r.seria, number: r.number, status: r.status });
    }
  }
  return found;
}

/**
 * Pulls incoming supplier invoices (we are the buyer) from e-Factura, stores
 * their lines and auto-posts lines covered by trusted supplier mappings.
 * Idempotent: re-running only refreshes statuses and resumes pending work.
 */
export async function syncPurchaseInvoices(
  options: { lookbackDays?: number } = {},
): Promise<PurchaseSyncResult> {
  const result: PurchaseSyncResult = {
    skipped: null,
    discovered: 0,
    imported: 0,
    autoPosted: 0,
    autoIgnored: 0,
    needsReview: 0,
    remainingDetails: 0,
  };

  const client: EFacturaClient | null = getEFacturaBuyerClient();
  if (!client) return { ...result, skipped: "efactura_mock" };

  const lookbackDays: number = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const issuedFrom = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const identities = await discover(client, issuedFrom);
  result.discovered = identities.length;

  for (const id of identities) {
    await prisma.purchaseInvoice.upsert({
      where: { seria_number: { seria: id.seria, number: id.number } },
      create: { seria: id.seria, number: id.number, eFacturaStatus: id.status },
      update: { eFacturaStatus: id.status, lastSyncedAt: new Date() },
    });
  }

  const pending = await prisma.purchaseInvoice.findMany({
    where: { detailsFetchedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, seria: true, number: true },
  });

  for (const inv of pending.slice(0, MAX_DETAIL_FETCHES)) {
    const full = await client.getInvoiceBySeriaNumber(inv.seria, inv.number);
    const xml: string | null = typeof full?.raw === "string" ? full.raw : null;
    if (!xml) continue;
    await storeInvoiceDetails(inv.id, parseInvoiceXml(xml), xml);
    result.imported += 1;
  }
  result.remainingDetails = Math.max(0, pending.length - MAX_DETAIL_FETCHES);

  const open = await prisma.purchaseInvoice.findMany({
    where: {
      detailsFetchedAt: { not: null },
      lines: {
        some: { status: { in: [PurchaseLineStatus.Unmatched, PurchaseLineStatus.Suggested] } },
      },
    },
    select: { id: true },
  });
  const costsIncludeVat: boolean = await purchaseCostsIncludeVat();
  for (const inv of open) {
    for (const outcome of await applyMappings(inv.id, costsIncludeVat)) {
      if (outcome === "posted") result.autoPosted += 1;
      else if (outcome === "ignored") result.autoIgnored += 1;
      else result.needsReview += 1;
    }
  }

  return result;
}
