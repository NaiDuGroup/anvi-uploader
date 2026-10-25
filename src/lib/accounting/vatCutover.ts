import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateAccountingSettings } from "./accountingSettings";
import { parseProductionCostsJson, type ProductionCostsConfig } from "./types";
import { VAT_MULTIPLIER } from "./vatBasis";

/**
 * One-time switch of purchase-cost accounting from VAT-inclusive to ex-VAT.
 *
 * - Every weighted-average and catalog purchase cost is divided by 1.2: unified
 *   stock variants (`avgCost` and the `purchaseCost` hint) — e.g. roll media,
 *   sheet paper and the printers' ink colours, whose blended cost prices
 *   wide-format ink.
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
    /**
     * Unified stock variants with an average cost or a purchase-cost hint — incl. mugs,
     * pens, notebooks, roll media and sheet paper (their costs live on the variants).
     */
    stockVariants: number;
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

const COSTED_VARIANT_WHERE = {
  OR: [{ avgCost: { not: null } }, { purchaseCost: { not: null } }],
} satisfies Prisma.StockVariantWhereInput;

export async function previewVatCutover(): Promise<VatCutoverPreview> {
  const settings = await prisma.accountingSettings.findUnique({ where: { id: "default" } });
  const prod: ProductionCostsConfig = parseProductionCostsJson(settings?.productionCosts ?? {});
  // Mugs, pens, notebooks, roll media and sheet paper are unified stock variants (counted in `stockVariants`).
  const stockVariants: number = await prisma.stockVariant.count({ where: COSTED_VARIANT_WHERE });
  return {
    appliedAt: settings?.vatCutoverAt?.toISOString() ?? null,
    counts: { stockVariants },
    markups: markupChanges(prod),
    productionNorms: productionNormChanges(prod),
  };
}

function exVatDecimal(value: Prisma.Decimal | null, digits: number): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal((Number(value) / VAT_MULTIPLIER).toFixed(digits));
}

export async function applyVatCutover(options: {
  convertProductionNorms: boolean;
}): Promise<VatCutoverPreview> {
  await prisma.$transaction(
    async (tx) => {
      const settings = await tx.accountingSettings.findUnique({ where: { id: "default" } });
      if (settings?.vatCutoverAt) throw new VatCutoverAlreadyApplied();

      // Mugs, pens, notebooks, roll media and sheet paper are unified stock variants (converted
      // below): average and cost hint both go ex-VAT, so the effective roll / paper cost
      // (average, else the hint) is divided by 1.2 exactly and cost-based sell prices stay
      // identical with the markups ×1.2.

      // Unified stock: per-unit costs keep 4 decimals (column scale), like roll media.
      const variants = await tx.stockVariant.findMany({
        where: COSTED_VARIANT_WHERE,
        select: { id: true, avgCost: true, purchaseCost: true },
      });
      for (const v of variants) {
        await tx.stockVariant.update({
          where: { id: v.id },
          data: { avgCost: exVatDecimal(v.avgCost, 4), purchaseCost: exVatDecimal(v.purchaseCost, 4) },
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
  return previewVatCutover();
}
