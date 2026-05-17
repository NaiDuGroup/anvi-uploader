import { Prisma } from "@prisma/client";
import { weightedAverageCostPerLinearMeter } from "@/lib/largeFormat/lfRollWeightedAverage";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";

export type Tx = Prisma.TransactionClient;

export async function recordLfRollStockReceipt(
  tx: Tx,
  params: {
    materialId: string;
    quantityLinearMeters: number;
    totalCostMdl: number;
    purchasedAt: Date;
    note?: string | null;
    supplier?: string | null;
    createdById?: string | null;
  },
): Promise<void> {
  const m = await tx.largeFormatMaterial.findUniqueOrThrow({
    where: { id: params.materialId },
  });

  const wa = weightedAverageCostPerLinearMeter({
    currentStockLinearMeters: Number(m.stockLinearMeters),
    currentAvgPerLinearMeter:
      m.avgPurchaseCostPerLinearMeter != null
        ? Number(m.avgPurchaseCostPerLinearMeter)
        : null,
    legacyCatalogCostPerLm: m.costPerLinearMeter,
    purchasedLinearMeters: params.quantityLinearMeters,
    purchaseTotalCostMdl: params.totalCostMdl,
  });

  const qtyLm = new Prisma.Decimal(params.quantityLinearMeters.toFixed(3));
  const stockLm = new Prisma.Decimal(wa.newStockLinearMeters.toFixed(3));
  const avgLm = new Prisma.Decimal(wa.newAvgPerLinearMeter.toFixed(4));
  const purchasedAt = toDatabaseDateOnly(params.purchasedAt);

  await tx.lfRollStockReceipt.create({
    data: {
      materialId: params.materialId,
      quantityLinearMeters: qtyLm,
      totalCostMdl: params.totalCostMdl,
      purchasedAt,
      supplier: params.supplier?.trim() ? params.supplier.trim() : null,
      note: params.note?.trim() ? params.note.trim() : null,
      createdById: params.createdById ?? null,
    },
  });

  await tx.largeFormatMaterial.update({
    where: { id: params.materialId },
    data: {
      stockLinearMeters: stockLm,
      avgPurchaseCostPerLinearMeter: avgLm,
    },
  });
}
