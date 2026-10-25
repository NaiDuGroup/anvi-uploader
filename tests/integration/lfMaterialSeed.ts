/**
 * Test rolls for integration tests. A roll is a `LargeFormatMaterial` pricing
 * row linked to a unified «Широкоформатные материалы» variant that holds its
 * balance and cost (stage 4 of the unified stock).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adjustToActual } from "@/lib/stock/unified/ledger";
import {
  createMaterialStockVariant,
  LEGACY_COST_COLUMN_PLACEHOLDER,
  LF_MATERIAL_LEGACY_KIND,
  lfMaterialStockAttributes,
  ROLL_MEDIA_CATEGORY_CODE,
} from "@/lib/stock/unified/materials";

export type TestLfMaterial = { id: string; variantId: string; name: string };

export async function createTestLfMaterial(
  name: string,
  opts: {
    stockLm?: number;
    /** Variant cost hint (MDL / m). */
    costPerLm?: number;
    rollWidthMeters?: string;
    /** null → derived from the roll width minus the default trim. */
    printableWidthMeters?: string | null;
    rollLengthMeters?: string;
    finalRetailPricePerLinearMeter?: number;
    finalDealerPricePerLinearMeter?: number;
    manualFinalRetailPricePerLinearMeter?: number | null;
    manualFinalDealerPricePerLinearMeter?: number | null;
  } = {},
): Promise<TestLfMaterial> {
  return prisma.$transaction(async (tx) => {
    const rollWidthMeters = new Prisma.Decimal(opts.rollWidthMeters ?? "1.520");
    const printableWidthMeters =
      opts.printableWidthMeters === null ? null : new Prisma.Decimal(opts.printableWidthMeters ?? "1.220");
    const rollLengthMeters = new Prisma.Decimal(opts.rollLengthMeters ?? "30.000");
    const row = await tx.largeFormatMaterial.create({
      data: {
        name,
        rollWidthMeters,
        printableWidthMeters,
        rollLengthMeters,
        costPerLinearMeter: LEGACY_COST_COLUMN_PLACEHOLDER,
        dealerPricePerLinearMeter: 80,
        retailPricePerLinearMeter: 120,
        dealerPrintPricePerLinearMeter: 25,
        retailPrintPricePerLinearMeter: 45,
        finalRetailPricePerLinearMeter: opts.finalRetailPricePerLinearMeter ?? 100,
        finalDealerPricePerLinearMeter: opts.finalDealerPricePerLinearMeter ?? 80,
        manualFinalRetailPricePerLinearMeter: opts.manualFinalRetailPricePerLinearMeter ?? null,
        manualFinalDealerPricePerLinearMeter: opts.manualFinalDealerPricePerLinearMeter ?? null,
        isActive: true,
        sortOrder: 0,
      },
      select: { id: true },
    });
    const variantId: string = await createMaterialStockVariant(tx, {
      categoryCode: ROLL_MEDIA_CATEGORY_CODE,
      legacyKind: LF_MATERIAL_LEGACY_KIND,
      legacyId: row.id,
      skuPrefix: "ROLL",
      name,
      isActive: true,
      sortOrder: 0,
      attributes: lfMaterialStockAttributes({ rollWidthMeters, printableWidthMeters, rollLengthMeters }),
      purchaseCost: opts.costPerLm ?? 40,
    });
    await tx.largeFormatMaterial.update({ where: { id: row.id }, data: { stockVariantId: variantId } });
    if ((opts.stockLm ?? 0) > 0) {
      await adjustToActual(tx, {
        variantId,
        actualQuantity: opts.stockLm!,
        note: "IT seed",
        createdById: null,
      });
    }
    return { id: row.id, variantId, name };
  });
}

/** Balance of the roll's variant (m). */
export async function rollStock(variantId: string): Promise<number> {
  const v = await prisma.stockVariant.findUnique({ where: { id: variantId } });
  return Number(v?.stockQuantity ?? 0);
}

/** Removes the roll, its orders, ledger and stock item. */
export async function cleanupTestLfMaterial(m: TestLfMaterial): Promise<void> {
  const v = await prisma.stockVariant.findUnique({ where: { id: m.variantId }, select: { itemId: true } });
  await prisma.order.deleteMany({
    where: {
      orderLines: { some: { OR: [{ largeFormatMaterialId: m.id }, { stockVariantId: m.variantId }] } },
    },
  });
  await prisma.stockMovement.deleteMany({ where: { variantId: m.variantId } });
  await prisma.largeFormatMaterial.deleteMany({ where: { id: m.id } });
  if (v) await prisma.stockItem.deleteMany({ where: { id: v.itemId } });
}
