/**
 * Test notebooks for integration tests. Notebooks are unified «Блокноты»
 * variants: the returned `id` is the variant id the APIs expect.
 */
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { createNotebookCatalogItem } from "@/lib/notebook/notebookCatalogWrite";
import { NOTEBOOK_ATTRIBUTE_DEFAULTS } from "@/lib/notebook/notebookVariant";

export async function createTestNotebook(stockQuantity: number, skuPrefix = "IT-NB") {
  const sku = `${skuPrefix}-${Date.now()}-${nanoid(6)}`.toUpperCase();
  return prisma.$transaction((tx) =>
    createNotebookCatalogItem(
      tx,
      {
        sku,
        nameRo: "IT Notebook",
        nameRu: "IT Notebook",
        nameEn: "IT Notebook",
        stockQuantity,
        sellPrice: null,
        dealerPrice: null,
        purchaseCost: null,
        imageUrl: null,
        ...NOTEBOOK_ATTRIBUTE_DEFAULTS,
        isActive: true,
        sortOrder: 0,
        internalNotes: null,
      },
      null,
    ),
  );
}

export async function notebookStock(variantId: string): Promise<number> {
  const v = await prisma.stockVariant.findUnique({ where: { id: variantId } });
  return Number(v?.stockQuantity ?? 0);
}

/** Removes the notebook, its ledger and every order that references it. */
export async function cleanupTestNotebook(variantId: string): Promise<void> {
  const v = await prisma.stockVariant.findUnique({ where: { id: variantId }, select: { itemId: true } });
  await prisma.order.deleteMany({ where: { orderLines: { some: { stockVariantId: variantId } } } });
  await prisma.stockMovement.deleteMany({ where: { variantId } });
  if (v) await prisma.stockItem.deleteMany({ where: { id: v.itemId } });
}
