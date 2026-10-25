import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEFacturaLive } from "@/lib/efactura";
import {
  SuggestionSource,
  type LineSuggestion,
  type LinkCandidates,
  type PurchaseInvoiceDetailResponse,
  type PurchaseInvoiceListItem,
  type PurchaseInvoiceListResponse,
  type PurchaseLineCounts,
  type PurchaseLineDto,
  type SupplierMappingDto,
  type SupplierMappingsResponse,
} from "./dto";
import { isPriceDriftSuspicious } from "./invoiceStatus";
import { purchaseCostsIncludeVat } from "./purchaseCostBasis";
import { supplierKey } from "./postPurchaseLine";
import { findUnlinkedReceipts } from "./receiptLinking";
import { listStockTargetOptions } from "./stockTargets";
import { unifiedTargetOptionsByIds } from "./unifiedStockTarget";
import { rankStockTargets, suggestUnitsPerInvoiceUnit } from "./suggestMapping";
import {
  AUTO_POST_CONFIRMATIONS,
  isPostableKind,
  isStockTargetKind,
  PurchaseInvoiceStatus,
  PurchaseLineStatus,
  StockTargetKind,
  targetStockUnit,
  type PostableStockTargetKind,
  type PurchaseStockUnit,
  type StockTargetOption,
} from "./types";

const OPEN_LINE_STATUSES: PurchaseLineStatus[] = [
  PurchaseLineStatus.Unmatched,
  PurchaseLineStatus.Suggested,
];

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function num(d: Prisma.Decimal | null): number | null {
  return d == null ? null : Number(d);
}

function asInvoiceStatus(raw: string): PurchaseInvoiceStatus {
  return (Object.values(PurchaseInvoiceStatus) as string[]).includes(raw)
    ? (raw as PurchaseInvoiceStatus)
    : PurchaseInvoiceStatus.New;
}

function asLineStatus(raw: string): PurchaseLineStatus {
  return (Object.values(PurchaseLineStatus) as string[]).includes(raw)
    ? (raw as PurchaseLineStatus)
    : PurchaseLineStatus.Unmatched;
}

function asKind(raw: string | null): StockTargetKind {
  return raw && isStockTargetKind(raw) ? raw : StockTargetKind.Ignore;
}

function targetKey(kind: string, id: string | null): string {
  return `${kind}:${id ?? ""}`;
}

/**
 * Unified variants referenced by posted lines / rules but missing from the
 * active picker options (deactivated since) — still need names and units.
 */
async function referencedUnifiedTargets(
  targets: readonly StockTargetOption[],
  refs: ReadonlyArray<{ kind: string | null; id: string | null }>,
): Promise<StockTargetOption[]> {
  const known = new Set<string>(targets.map((t) => targetKey(t.kind, t.id)));
  const missing: string[] = refs.flatMap((r) =>
    r.kind === StockTargetKind.StockVariant && r.id && !known.has(targetKey(r.kind, r.id)) ? [r.id] : [],
  );
  return unifiedTargetOptionsByIds(prisma, missing);
}

function emptyCounts(): PurchaseLineCounts {
  return {
    [PurchaseLineStatus.Unmatched]: 0,
    [PurchaseLineStatus.Suggested]: 0,
    [PurchaseLineStatus.Posted]: 0,
    [PurchaseLineStatus.Ignored]: 0,
  };
}

type InvoiceWithLineStatuses = Prisma.PurchaseInvoiceGetPayload<{
  include: { lines: { select: { status: true } } };
}>;

function toListItem(inv: InvoiceWithLineStatuses): PurchaseInvoiceListItem {
  const lineCounts: PurchaseLineCounts = emptyCounts();
  for (const l of inv.lines) lineCounts[asLineStatus(l.status)] += 1;
  return {
    id: inv.id,
    seria: inv.seria,
    number: inv.number,
    eFacturaStatus: inv.eFacturaStatus,
    supplierName: inv.supplierName,
    supplierIdno: inv.supplierIdno,
    issueDate: iso(inv.issueDate),
    deliveryDate: iso(inv.deliveryDate),
    totalExVat: num(inv.totalExVat),
    totalAmount: num(inv.totalAmount),
    status: asInvoiceStatus(inv.status),
    lineCounts,
  };
}

export enum InvoiceListFilter {
  Open = "open",
  All = "all",
}

export async function listPurchaseInvoices(
  filter: InvoiceListFilter,
): Promise<PurchaseInvoiceListResponse> {
  const openWhere: Prisma.PurchaseInvoiceWhereInput = {
    lines: { some: { status: { in: OPEN_LINE_STATUSES } } },
  };
  const [invoices, openInvoiceCount, openLineCount, lastSync] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: filter === InvoiceListFilter.Open ? openWhere : undefined,
      include: { lines: { select: { status: true } } },
      orderBy: [{ issueDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.purchaseInvoice.count({ where: openWhere }),
    prisma.purchaseInvoiceLine.count({ where: { status: { in: OPEN_LINE_STATUSES } } }),
    prisma.purchaseInvoice.aggregate({ _max: { lastSyncedAt: true } }),
  ]);

  return {
    invoices: invoices.map(toListItem),
    openInvoiceCount,
    openLineCount,
    lastSyncedAt: iso(lastSync._max.lastSyncedAt),
    live: isEFacturaLive(),
  };
}

function suggestedFactors(
  name: string,
  unit: string | null,
): Record<PostableStockTargetKind, number> {
  return {
    [StockTargetKind.StockVariant]: suggestUnitsPerInvoiceUnit(StockTargetKind.StockVariant, name, unit),
    [StockTargetKind.Mug]: suggestUnitsPerInvoiceUnit(StockTargetKind.Mug, name, unit),
    [StockTargetKind.Notebook]: suggestUnitsPerInvoiceUnit(StockTargetKind.Notebook, name, unit),
    [StockTargetKind.Pen]: suggestUnitsPerInvoiceUnit(StockTargetKind.Pen, name, unit),
    [StockTargetKind.LfMaterial]: suggestUnitsPerInvoiceUnit(StockTargetKind.LfMaterial, name, unit),
    [StockTargetKind.SheetPaper]: suggestUnitsPerInvoiceUnit(StockTargetKind.SheetPaper, name, unit),
    [StockTargetKind.Ink]: suggestUnitsPerInvoiceUnit(StockTargetKind.Ink, name, unit),
    [StockTargetKind.Garment]: suggestUnitsPerInvoiceUnit(StockTargetKind.Garment, name, unit),
    [StockTargetKind.DtfFilm]: suggestUnitsPerInvoiceUnit(StockTargetKind.DtfFilm, name, unit),
    [StockTargetKind.DtfPowder]: suggestUnitsPerInvoiceUnit(StockTargetKind.DtfPowder, name, unit),
  };
}

const PURCHASE_STOCK_UNITS: readonly PurchaseStockUnit[] = ["pcs", "lm", "sheets", "ml", "g"];

function suggestedUnifiedFactors(name: string, unit: string | null): Record<PurchaseStockUnit, number> {
  return Object.fromEntries(
    PURCHASE_STOCK_UNITS.map((u) => [
      u,
      suggestUnitsPerInvoiceUnit(StockTargetKind.StockVariant, name, unit, u),
    ]),
  ) as Record<PurchaseStockUnit, number>;
}

export async function getPurchaseInvoiceDetail(
  id: string,
): Promise<PurchaseInvoiceDetailResponse | null> {
  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return null;

  const [targets, mappings, costsIncludeVat] = await Promise.all([
    listStockTargetOptions(prisma),
    prisma.supplierItemMapping.findMany({
      where: {
        supplierIdno: supplierKey(invoice),
        normalizedName: { in: invoice.lines.map((l) => l.normalizedName) },
      },
    }),
    purchaseCostsIncludeVat(),
  ]);
  const referencedTargets: StockTargetOption[] = await referencedUnifiedTargets(targets, [
    ...invoice.lines.map((l) => ({ kind: l.postedKind, id: l.postedTargetId })),
    ...mappings.map((m) => ({ kind: m.targetKind, id: m.targetId })),
  ]);
  const targetByKey = new Map<string, StockTargetOption>(
    [...targets, ...referencedTargets].map((t) => [targetKey(t.kind, t.id), t]),
  );
  const targetNames = new Map<string, string>(
    [...targetByKey].map(([key, t]) => [key, t.name]),
  );
  const mappingByName = new Map(mappings.map((m) => [m.normalizedName, m]));

  const invoiceDate: Date = invoice.deliveryDate ?? invoice.issueDate ?? invoice.createdAt;

  const linkCandidatesFor = async (
    suggestion: LineSuggestion | undefined,
  ): Promise<LinkCandidates | null> => {
    if (!suggestion?.targetId || !isPostableKind(suggestion.kind)) return null;
    const receipts = await findUnlinkedReceipts(prisma, suggestion.kind, suggestion.targetId, invoiceDate);
    if (receipts.length === 0) return null;
    return {
      kind: suggestion.kind,
      targetId: suggestion.targetId,
      receipts: receipts.map((r) => ({
        id: r.id,
        quantity: r.quantity,
        totalCostMdl: r.totalCostMdl,
        purchasedAt: r.purchasedAt.toISOString(),
        isProvisional: r.isProvisional,
      })),
    };
  };

  const lines: PurchaseLineDto[] = await Promise.all(invoice.lines.map(async (line) => {
    const status: PurchaseLineStatus = asLineStatus(line.status);
    const unitPrice: number | null = num(line.unitPriceExVat);
    const suggestions: LineSuggestion[] = [];

    const mapping = mappingByName.get(line.normalizedName);
    if (mapping) {
      const kind: StockTargetKind = asKind(mapping.targetKind);
      suggestions.push({
        source: SuggestionSource.Mapping,
        kind,
        targetId: mapping.targetId,
        targetName: targetNames.get(targetKey(kind, mapping.targetId)) ?? null,
        unitsPerInvoiceUnit: Number(mapping.unitsPerInvoiceUnit),
        score: null,
        confirmedCount: mapping.confirmedCount,
        priceDrift: isPriceDriftSuspicious(num(mapping.lastUnitPriceExVat), unitPrice),
      });
    }
    const isLineOpen: boolean =
      status !== PurchaseLineStatus.Posted && status !== PurchaseLineStatus.Ignored;
    if (isLineOpen) {
      for (const t of rankStockTargets(line.name, targets)) {
        if (mapping && mapping.targetKind === t.kind && mapping.targetId === t.id) continue;
        suggestions.push({
          source: SuggestionSource.Similarity,
          kind: t.kind,
          targetId: t.id,
          targetName: t.name,
          unitsPerInvoiceUnit: suggestUnitsPerInvoiceUnit(t.kind, line.name, line.unit, t.unit),
          score: t.score,
          confirmedCount: 0,
          priceDrift: false,
        });
      }
    }

    const postedKind: StockTargetKind = asKind(line.postedKind);
    return {
      id: line.id,
      position: line.position,
      name: line.name,
      unit: line.unit,
      quantity: Number(line.quantity),
      unitPriceExVat: unitPrice,
      totalExVat: Number(line.totalExVat),
      vatAmount: num(line.vatAmount),
      total: Number(line.total),
      status,
      posted:
        line.postedAt != null
          ? {
              kind: postedKind,
              targetId: line.postedTargetId,
              targetName: targetNames.get(targetKey(postedKind, line.postedTargetId)) ?? null,
              stockUnit: isPostableKind(postedKind)
                ? targetStockUnit(postedKind, targetByKey.get(targetKey(postedKind, line.postedTargetId)))
                : null,
              quantity: num(line.postedQuantity) ?? 0,
              costMdl: num(line.postedCostMdl) ?? 0,
              auto: line.postedAuto,
              postedAt: line.postedAt.toISOString(),
            }
          : null,
      suggestions,
      suggestedFactors: suggestedFactors(line.name, line.unit),
      suggestedUnifiedFactors: suggestedUnifiedFactors(line.name, line.unit),
      linkCandidates: isLineOpen ? await linkCandidatesFor(suggestions[0]) : null,
    };
  }));

  return {
    invoice: toListItem(invoice),
    lines,
    targets,
    referencedTargets,
    costsIncludeVat,
  };
}

export async function listSupplierMappings(): Promise<SupplierMappingsResponse> {
  const [mappings, targets] = await Promise.all([
    prisma.supplierItemMapping.findMany({
      orderBy: [{ supplierName: "asc" }, { sampleName: "asc" }],
    }),
    listStockTargetOptions(prisma),
  ]);
  const referencedTargets: StockTargetOption[] = await referencedUnifiedTargets(
    targets,
    mappings.map((m) => ({ kind: m.targetKind, id: m.targetId })),
  );
  const targetNames = new Map<string, string>(
    [...targets, ...referencedTargets].map((t: StockTargetOption) => [targetKey(t.kind, t.id), t.name]),
  );
  const rows: SupplierMappingDto[] = mappings.map((m) => {
    const kind: StockTargetKind = asKind(m.targetKind);
    return {
      id: m.id,
      supplierIdno: m.supplierIdno,
      supplierName: m.supplierName,
      sampleName: m.sampleName,
      targetKind: kind,
      targetId: m.targetId,
      targetName: targetNames.get(targetKey(kind, m.targetId)) ?? null,
      unitsPerInvoiceUnit: Number(m.unitsPerInvoiceUnit),
      confirmedCount: m.confirmedCount,
      autoPosts: m.confirmedCount >= AUTO_POST_CONFIRMATIONS,
      lastUnitPriceExVat: num(m.lastUnitPriceExVat),
      lastSeenAt: iso(m.lastSeenAt),
    };
  });
  return { mappings: rows, targets, referencedTargets };
}
