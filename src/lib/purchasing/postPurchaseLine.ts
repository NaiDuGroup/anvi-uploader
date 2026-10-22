import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeLineName } from "./normalizeLineName";
import { PostLineError, PostLineFailure } from "./postLineErrors";
import { deriveInvoiceStatus } from "./invoiceStatus";
import { invoiceLineReceiptCost } from "./purchaseCostBasis";
import { linkReceiptToInvoiceLine } from "./receiptLinking";
import { allocateStockBacklog, recordStockReceipt, stockTargetExists } from "./stockTargets";
import {
  isPostableKind,
  PurchaseLineStatus,
  stockQuantityFromInvoice,
  type StockTargetKind,
  type PostableStockTargetKind,
} from "./types";

type Tx = Prisma.TransactionClient;

export { PostLineError, PostLineFailure };

export type PostLineInput = {
  lineId: string;
  kind: StockTargetKind;
  /** Required unless `kind` is `ignore`. */
  targetId: string | null;
  /** Our stock units per one invoice unit. */
  unitsPerInvoiceUnit: number;
  createdById: string | null;
  /** True when posted by the sync job from a confirmed mapping. */
  auto: boolean;
  /** Basis for the booked cost (see `purchaseCostsIncludeVat`). */
  costsIncludeVat: boolean;
  /** Attach this existing (hand-entered) receipt instead of posting a new one. */
  linkReceiptId?: string | null;
};

export type PostLineResult = {
  status: PurchaseLineStatus.Posted | PurchaseLineStatus.Ignored;
  kind: StockTargetKind;
  targetId: string | null;
  quantity: number;
  costMdl: number;
  /** Set when an existing receipt was linked: price difference applied to it. */
  linkedDeltaMdl: number | null;
};

/** Mapping key for a supplier: IDNO when known, otherwise the normalized name. */
export function supplierKey(invoice: { supplierIdno: string | null; supplierName: string | null }): string {
  if (invoice.supplierIdno) return invoice.supplierIdno;
  return `name:${normalizeLineName(invoice.supplierName ?? "unknown")}`;
}

async function upsertMapping(
  tx: Tx,
  params: {
    supplierIdno: string;
    supplierName: string | null;
    normalizedName: string;
    sampleName: string;
    kind: StockTargetKind;
    targetId: string | null;
    unitsPerInvoiceUnit: number;
    unitPriceExVat: number | null;
    auto: boolean;
  },
): Promise<string> {
  const key = {
    supplierIdno_normalizedName: {
      supplierIdno: params.supplierIdno,
      normalizedName: params.normalizedName,
    },
  };
  const existing = await tx.supplierItemMapping.findUnique({ where: key });
  const sameRule: boolean =
    existing !== null &&
    existing.targetKind === params.kind &&
    existing.targetId === params.targetId &&
    Number(existing.unitsPerInvoiceUnit) === params.unitsPerInvoiceUnit;

  /** A manual confirmation of the same rule builds trust; a changed rule starts over. */
  const confirmedCount: number = params.auto
    ? (existing?.confirmedCount ?? 0)
    : sameRule
      ? (existing?.confirmedCount ?? 0) + 1
      : 1;

  const data = {
    supplierName: params.supplierName,
    sampleName: params.sampleName,
    targetKind: params.kind,
    targetId: params.targetId,
    unitsPerInvoiceUnit: new Prisma.Decimal(params.unitsPerInvoiceUnit),
    confirmedCount,
    lastUnitPriceExVat:
      params.unitPriceExVat != null ? new Prisma.Decimal(params.unitPriceExVat) : undefined,
    lastSeenAt: new Date(),
  };

  const saved = await tx.supplierItemMapping.upsert({
    where: key,
    create: {
      supplierIdno: params.supplierIdno,
      normalizedName: params.normalizedName,
      ...data,
    },
    update: data,
    select: { id: true },
  });
  return saved.id;
}

export async function refreshInvoiceStatus(tx: Tx, invoiceId: string): Promise<void> {
  const lines = await tx.purchaseInvoiceLine.findMany({
    where: { invoiceId },
    select: { status: true },
  });
  await tx.purchaseInvoice.update({
    where: { id: invoiceId },
    data: { status: deriveInvoiceStatus(lines.map((l) => l.status)) },
  });
}

/**
 * Posts one invoice line into stock (or marks it ignored) and remembers the
 * supplier-name → stock-item rule so later invoices can post automatically.
 */
export async function postPurchaseLine(input: PostLineInput): Promise<PostLineResult> {
  if (!(input.unitsPerInvoiceUnit > 0)) {
    throw new PostLineFailure(PostLineError.InvalidFactor);
  }

  const result: PostLineResult = await prisma.$transaction(async (tx) => {
    const line = await tx.purchaseInvoiceLine.findUnique({
      where: { id: input.lineId },
      include: { invoice: true },
    });
    if (!line) throw new PostLineFailure(PostLineError.NotFound);
    if (line.status === PurchaseLineStatus.Posted || line.status === PurchaseLineStatus.Ignored) {
      throw new PostLineFailure(PostLineError.AlreadyDone);
    }

    const { invoice } = line;
    const postKind: PostableStockTargetKind | null = isPostableKind(input.kind) ? input.kind : null;
    const targetId: string | null = postKind ? input.targetId : null;
    if (postKind && (!targetId || !(await stockTargetExists(tx, postKind, targetId)))) {
      throw new PostLineFailure(PostLineError.TargetNotFound);
    }

    const mappingId: string = await upsertMapping(tx, {
      supplierIdno: supplierKey(invoice),
      supplierName: invoice.supplierName,
      normalizedName: line.normalizedName,
      sampleName: line.name,
      kind: input.kind,
      targetId,
      unitsPerInvoiceUnit: input.unitsPerInvoiceUnit,
      unitPriceExVat: line.unitPriceExVat != null ? Number(line.unitPriceExVat) : null,
      auto: input.auto,
    });

    let quantity: number = !postKind
      ? 0
      : stockQuantityFromInvoice(postKind, Number(line.quantity), input.unitsPerInvoiceUnit);
    const costMdl: number = !postKind
      ? 0
      : invoiceLineReceiptCost(
          { totalExVat: Number(line.totalExVat), total: Number(line.total) },
          input.costsIncludeVat,
        );

    let linkedDeltaMdl: number | null = null;
    if (postKind && targetId && input.linkReceiptId) {
      const linked = await linkReceiptToInvoiceLine(tx, {
        kind: postKind,
        targetId,
        receiptId: input.linkReceiptId,
        purchaseInvoiceLineId: line.id,
        invoiceCostMdl: costMdl,
        amountsIncludeVat: input.costsIncludeVat,
      });
      if (!linked) throw new PostLineFailure(PostLineError.ReceiptNotFound);
      linkedDeltaMdl = linked.deltaMdl;
      quantity = linked.quantity;
    } else if (postKind && targetId) {
      await recordStockReceipt(tx, {
        kind: postKind,
        targetId,
        quantity,
        totalCostMdl: costMdl,
        purchasedAt: invoice.deliveryDate ?? invoice.issueDate ?? new Date(),
        supplier: invoice.supplierName,
        note: `e-Factura ${invoice.seria} ${invoice.number}`,
        createdById: input.createdById,
        purchaseInvoiceLineId: line.id,
        amountsIncludeVat: input.costsIncludeVat,
      });
    }

    const status = postKind ? PurchaseLineStatus.Posted : PurchaseLineStatus.Ignored;
    await tx.purchaseInvoiceLine.update({
      where: { id: line.id },
      data: {
        status,
        mappingId,
        postedKind: input.kind,
        postedTargetId: targetId,
        postedQuantity: new Prisma.Decimal(quantity.toFixed(3)),
        postedCostMdl: new Prisma.Decimal(costMdl.toFixed(2)),
        postedAt: new Date(),
        postedAuto: input.auto,
        postedById: input.createdById,
      },
    });
    await refreshInvoiceStatus(tx, invoice.id);

    return { status, kind: input.kind, targetId, quantity, costMdl, linkedDeltaMdl };
  });

  const { kind: postedKind, targetId: postedTargetId } = result;
  if (isPostableKind(postedKind) && postedTargetId && result.linkedDeltaMdl === null) {
    try {
      await prisma.$transaction((tx) =>
        allocateStockBacklog(tx, postedKind, postedTargetId, input.createdById),
      );
    } catch (allocErr) {
      console.error("purchase line allocate backlog:", allocErr);
    }
  }

  return result;
}
