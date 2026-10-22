import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateAccountingSettings } from "./accountingSettings";
import { invalidateInkInventory } from "@/lib/ink/inkInventory";
import { parseProductionCostsJson, type ProductionCostsConfig } from "./types";
import { VAT_MULTIPLIER } from "./vatBasis";

/**
 * One-time switch of purchase-cost accounting from VAT-inclusive to ex-VAT.
 *
 * - Every weighted-average and catalog purchase cost is divided by 1.2.
 * - Wide-format markup multipliers (material and ink) are multiplied by 1.2,
 *   so customer sell prices derived from cost stay exactly the same.
 * - Optional: hand-entered production norms (print per mug/notebook, packaging,
 *   consumables) are divided by 1.2 as well.
 * - Historical receipts keep `amountsIncludeVat = true`; order snapshots are
 *   converted on the fly by the profit report (see `vatBasis.ts`).
 */

const MARKUP_KEYS = [
  "lfRetailMarkupMultiplier",
  "lfDealerMarkupMultiplier",
  "lfInkRetailMarkupMultiplier",
  "lfInkDealerMarkupMultiplier",
] as const satisfies readonly (keyof ProductionCostsConfig)[];

const PRODUCTION_MONEY_KEYS = [
  "mugPrintPerUnit",
  "notebookPrintPerUnit",
  "packagingPerOrder",
  "otherConsumablesPerOrder",
] as const satisfies readonly (keyof ProductionCostsConfig)[];

type MarkupKey = (typeof MARKUP_KEYS)[number];
type ProductionMoneyKey = (typeof PRODUCTION_MONEY_KEYS)[number];

export type VatCutoverValueChange<K extends string = string> = { key: K; from: number; to: number };

export type VatCutoverPreview = {
  appliedAt: string | null;
  counts: {
    mugs: number;
    notebooks: number;
    pens: number;
    lfMaterials: number;
    sheetPapers: number;
    inkTanks: number;
  };
  markups: VatCutoverValueChange[];
  productionNorms: VatCutoverValueChange[];
};

export class VatCutoverAlreadyApplied extends Error {
  constructor() {
    super("vat_cutover_already_applied");
  }
}

function round(n: number, digits: number): number {
  const f: number = 10 ** digits;
  return Math.round(n * f) / f;
}

function markupChanges(prod: ProductionCostsConfig): VatCutoverValueChange<MarkupKey>[] {
  return MARKUP_KEYS.filter((k) => prod[k] > 0).map((k) => ({
    key: k,
    from: prod[k],
    to: round(prod[k] * VAT_MULTIPLIER, 4),
  }));
}

function productionNormChanges(
  prod: ProductionCostsConfig,
): VatCutoverValueChange<ProductionMoneyKey>[] {
  return PRODUCTION_MONEY_KEYS.filter((k) => prod[k] > 0).map((k) => ({
    key: k,
    from: prod[k],
    to: Math.round(prod[k] / VAT_MULTIPLIER),
  }));
}

export async function previewVatCutover(): Promise<VatCutoverPreview> {
  const settings = await prisma.accountingSettings.findUnique({ where: { id: "default" } });
  const prod: ProductionCostsConfig = parseProductionCostsJson(settings?.productionCosts ?? {});
  const [mugs, notebooks, pens, lfMaterials, sheetPapers, inkTanks] = await Promise.all([
    prisma.mugProduct.count(),
    prisma.notebookProduct.count(),
    prisma.penProduct.count(),
    prisma.largeFormatMaterial.count(),
    prisma.sheetPaper.count(),
    prisma.inkInventory.count(),
  ]);
  return {
    appliedAt: settings?.vatCutoverAt?.toISOString() ?? null,
    counts: { mugs, notebooks, pens, lfMaterials, sheetPapers, inkTanks },
    markups: markupChanges(prod),
    productionNorms: productionNormChanges(prod),
  };
}

function exVatDecimal(value: Prisma.Decimal | null, digits: number): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal((Number(value) / VAT_MULTIPLIER).toFixed(digits));
}

type CatalogCostRow = {
  id: string;
  avgPurchaseCost: Prisma.Decimal | null;
  purchaseCost: Prisma.Decimal | null;
};

function catalogCostData(row: CatalogCostRow): {
  avgPurchaseCost: Prisma.Decimal | null;
  purchaseCost: Prisma.Decimal | null;
} {
  return {
    avgPurchaseCost: exVatDecimal(row.avgPurchaseCost, 4),
    purchaseCost: exVatDecimal(row.purchaseCost, 2),
  };
}

export async function applyVatCutover(options: {
  convertProductionNorms: boolean;
}): Promise<VatCutoverPreview> {
  await prisma.$transaction(
    async (tx) => {
      const settings = await tx.accountingSettings.findUnique({ where: { id: "default" } });
      if (settings?.vatCutoverAt) throw new VatCutoverAlreadyApplied();

      const costSelect = { id: true, avgPurchaseCost: true, purchaseCost: true } as const;
      for (const row of await tx.mugProduct.findMany({ select: costSelect })) {
        await tx.mugProduct.update({ where: { id: row.id }, data: catalogCostData(row) });
      }
      for (const row of await tx.notebookProduct.findMany({ select: costSelect })) {
        await tx.notebookProduct.update({ where: { id: row.id }, data: catalogCostData(row) });
      }
      for (const row of await tx.penProduct.findMany({ select: costSelect })) {
        await tx.penProduct.update({ where: { id: row.id }, data: catalogCostData(row) });
      }

      /**
       * Integer catalog fallbacks (roll media, sheet paper) would lose precision;
       * the exact ex-VAT value goes into the average so cost-based sell prices
       * stay identical, and the integer hint is rounded.
       */
      const materials = await tx.largeFormatMaterial.findMany({
        select: { id: true, avgPurchaseCostPerLinearMeter: true, costPerLinearMeter: true },
      });
      for (const m of materials) {
        const avgSource: number =
          m.avgPurchaseCostPerLinearMeter != null
            ? Number(m.avgPurchaseCostPerLinearMeter)
            : m.costPerLinearMeter;
        await tx.largeFormatMaterial.update({
          where: { id: m.id },
          data: {
            avgPurchaseCostPerLinearMeter: new Prisma.Decimal((avgSource / VAT_MULTIPLIER).toFixed(4)),
            costPerLinearMeter: Math.round(m.costPerLinearMeter / VAT_MULTIPLIER),
          },
        });
      }

      const papers = await tx.sheetPaper.findMany({
        select: { id: true, avgPurchaseCostPerSheet: true, costPerSheet: true },
      });
      for (const p of papers) {
        await tx.sheetPaper.update({
          where: { id: p.id },
          data: {
            avgPurchaseCostPerSheet: exVatDecimal(p.avgPurchaseCostPerSheet, 4),
            costPerSheet: Math.round(p.costPerSheet / VAT_MULTIPLIER),
          },
        });
      }

      for (const tank of await tx.inkInventory.findMany({ select: { id: true, avgCostPerMl: true } })) {
        await tx.inkInventory.update({
          where: { id: tank.id },
          data: { avgCostPerMl: new Prisma.Decimal((Number(tank.avgCostPerMl) / VAT_MULTIPLIER).toFixed(8)) },
        });
      }

      const prod: ProductionCostsConfig = parseProductionCostsJson(settings?.productionCosts ?? {});
      const nextProd: ProductionCostsConfig = { ...prod };
      for (const c of markupChanges(prod)) {
        nextProd[c.key] = c.to;
      }
      if (options.convertProductionNorms) {
        for (const c of productionNormChanges(prod)) {
          nextProd[c.key] = c.to;
        }
      }

      const data = {
        productionCosts: nextProd,
        purchaseCostsIncludeVat: false,
        vatCutoverAt: new Date(),
      };
      await tx.accountingSettings.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
    },
    { timeout: 120_000 },
  );

  invalidateAccountingSettings();
  invalidateInkInventory();
  return previewVatCutover();
}
