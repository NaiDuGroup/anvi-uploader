/**
 * Test mugs for integration tests. Mugs are unified «Кружки» variants: the
 * returned `id` is the variant id the APIs expect.
 */
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { createMugCatalogItem } from "@/lib/mug/mugCatalogWrite";
import { MUG_ATTRIBUTE_DEFAULTS } from "@/lib/mug/mugVariant";

export async function createTestMug(
  stockQuantity: number,
  opts: { skuPrefix?: string; sellPrice?: number | null; purchaseCost?: number | null } = {},
) {
  const sku = `${opts.skuPrefix ?? "IT-MUG"}-${Date.now()}-${nanoid(6)}`.toUpperCase();
  return prisma.$transaction((tx) =>
    createMugCatalogItem(
      tx,
      {
        sku,
        nameRo: "IT Mug",
        nameRu: "IT Mug",
        nameEn: "IT Mug",
        stockQuantity,
        sellPrice: opts.sellPrice ?? null,
        dealerPrice: null,
        purchaseCost: opts.purchaseCost ?? null,
        imageUrl: null,
        ...MUG_ATTRIBUTE_DEFAULTS,
        isActive: true,
        sortOrder: 0,
        internalNotes: null,
      },
      null,
    ),
  );
}

export async function mugStock(variantId: string): Promise<number> {
  const v = await prisma.stockVariant.findUnique({ where: { id: variantId } });
  return Number(v?.stockQuantity ?? 0);
}

/** Removes the mugs, their ledger and every order that references them. */
export async function cleanupTestMugs(variantIds: string[]): Promise<void> {
  for (const variantId of variantIds) {
    const v = await prisma.stockVariant.findUnique({ where: { id: variantId }, select: { itemId: true } });
    await prisma.order.deleteMany({ where: { orderLines: { some: { stockVariantId: variantId } } } });
    await prisma.stockMovement.deleteMany({ where: { variantId } });
    if (v) await prisma.stockItem.deleteMany({ where: { id: v.itemId } });
  }
}
