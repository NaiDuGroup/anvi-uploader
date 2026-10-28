import { Prisma, type PrismaClient } from "@prisma/client";
import { parseUvPrintNorms, uvPrintNormsAttributes, type UvPrintNorms } from "@/lib/uv/uvPrintNorms";
import { adjustToActual } from "@/lib/stock/unified/ledger";
import type { NotebookPaperKind } from "./notebookPaperKind";
import {
  NOTEBOOK_VARIANT_INCLUDE,
  NOTEBOOK_VARIANT_WHERE,
  notebookAttributesJson,
  parseNotebookAttributes,
  requireNotebooksCategoryId,
  type NotebookAttributes,
  type NotebookVariantWithItem,
} from "./notebookVariant";

/**
 * Admin notebook catalog writes on the unified stock: a notebook is one
 * `StockItem` in category `notebooks` with exactly one `StockVariant` (same
 * sku). Balance changes go through the ledger (stocktake = `adjustToActual`).
 */

type Tx = Prisma.TransactionClient;

function uvNormsAttributes(norms: UvPrintNorms | undefined): Record<string, number | boolean> {
  return norms ? uvPrintNormsAttributes(norms) : {};
}

export type NotebookCatalogFields = {
  /** UV print norms (underbase layers, varnish, primer) stored in the item attributes. */
  uvPrintNorms?: UvPrintNorms;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  stockQuantity: number;
  sellPrice: number | null;
  dealerPrice: number | null;
  purchaseCost: number | null;
  imageUrl: string | null;
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  paperKind: NotebookPaperKind;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
};

export type NotebookCatalogPatch = Partial<NotebookCatalogFields>;

const STOCKTAKE_NOTE = "Остаток из каталога блокнотов";

function priceDecimal(value: number | null): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value.toFixed(2));
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const t: string = value?.trim() ?? "";
  return t === "" ? null : t;
}

/** Notebook SKUs are stored upper-case (as in the legacy catalog). */
function normalizedSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function attributesOf(f: NotebookCatalogFields): NotebookAttributes {
  return {
    coverColorHex: f.coverColorHex,
    strapColorHex: f.strapColorHex,
    bookmarkColorHex: f.bookmarkColorHex,
    paperKind: f.paperKind,
    printWidthCm: f.printWidthCm,
    printHeightCm: f.printHeightCm,
    printDpi: f.printDpi,
    has3dPreview: f.has3dPreview,
  };
}

export async function loadNotebookVariantForAdmin(
  tx: Tx | PrismaClient,
  variantId: string,
): Promise<NotebookVariantWithItem | null> {
  return tx.stockVariant.findFirst({
    where: { id: variantId, ...NOTEBOOK_VARIANT_WHERE },
    include: NOTEBOOK_VARIANT_INCLUDE,
  });
}

export async function createNotebookCatalogItem(
  tx: Tx,
  f: NotebookCatalogFields,
  createdById: string | null,
): Promise<NotebookVariantWithItem> {
  const categoryId: string = await requireNotebooksCategoryId(tx);
  const sku: string = normalizedSku(f.sku);
  const item = await tx.stockItem.create({
    data: {
      categoryId,
      sku,
      nameRo: f.nameRo.trim(),
      nameRu: f.nameRu.trim(),
      nameEn: f.nameEn.trim(),
      imageUrl: trimmedOrNull(f.imageUrl),
      attributes: { ...notebookAttributesJson(attributesOf(f)), ...uvNormsAttributes(f.uvPrintNorms) },
      isSellable: true,
      isActive: f.isActive,
      sortOrder: f.sortOrder,
      internalNotes: trimmedOrNull(f.internalNotes),
      variants: {
        create: {
          sku,
          options: { colorHex: f.coverColorHex },
          sellPrice: priceDecimal(f.sellPrice),
          dealerPrice: priceDecimal(f.dealerPrice),
          purchaseCost: priceDecimal(f.purchaseCost),
          isActive: f.isActive,
        },
      },
    },
    select: { variants: { select: { id: true } } },
  });
  const variantId: string = item.variants[0]!.id;
  if (f.stockQuantity > 0) {
    await adjustToActual(tx, {
      variantId,
      actualQuantity: f.stockQuantity,
      note: STOCKTAKE_NOTE,
      createdById,
    });
  }
  return (await loadNotebookVariantForAdmin(tx, variantId))!;
}

export async function updateNotebookCatalogItem(
  tx: Tx,
  existing: NotebookVariantWithItem,
  patch: NotebookCatalogPatch,
  createdById: string | null,
): Promise<NotebookVariantWithItem> {
  const attrs: NotebookAttributes = { ...parseNotebookAttributes(existing.item.attributes) };
  if (patch.coverColorHex !== undefined) attrs.coverColorHex = patch.coverColorHex;
  if (patch.strapColorHex !== undefined) attrs.strapColorHex = patch.strapColorHex;
  if (patch.bookmarkColorHex !== undefined) attrs.bookmarkColorHex = patch.bookmarkColorHex;
  if (patch.paperKind !== undefined) attrs.paperKind = patch.paperKind;
  if (patch.printWidthCm !== undefined) attrs.printWidthCm = patch.printWidthCm;
  if (patch.printHeightCm !== undefined) attrs.printHeightCm = patch.printHeightCm;
  if (patch.printDpi !== undefined) attrs.printDpi = patch.printDpi;
  if (patch.has3dPreview !== undefined) attrs.has3dPreview = patch.has3dPreview;

  const itemData: Prisma.StockItemUpdateInput = {
    // Keep unknown attribute keys other tools may have added.
    attributes: {
      ...(existing.item.attributes as Prisma.JsonObject),
      ...notebookAttributesJson(attrs),
      ...uvNormsAttributes(patch.uvPrintNorms),
    },
  };
  const variantData: Prisma.StockVariantUpdateInput = {};
  if (patch.sku !== undefined) {
    itemData.sku = normalizedSku(patch.sku);
    variantData.sku = normalizedSku(patch.sku);
  }
  if (patch.nameRo !== undefined) itemData.nameRo = patch.nameRo.trim();
  if (patch.nameRu !== undefined) itemData.nameRu = patch.nameRu.trim();
  if (patch.nameEn !== undefined) itemData.nameEn = patch.nameEn.trim();
  if (patch.imageUrl !== undefined) itemData.imageUrl = trimmedOrNull(patch.imageUrl);
  if (patch.sortOrder !== undefined) itemData.sortOrder = patch.sortOrder;
  if (patch.internalNotes !== undefined) itemData.internalNotes = trimmedOrNull(patch.internalNotes);
  if (patch.isActive !== undefined) {
    itemData.isActive = patch.isActive;
    variantData.isActive = patch.isActive;
  }
  if (patch.sellPrice !== undefined) variantData.sellPrice = priceDecimal(patch.sellPrice);
  if (patch.dealerPrice !== undefined) variantData.dealerPrice = priceDecimal(patch.dealerPrice);
  if (patch.purchaseCost !== undefined) variantData.purchaseCost = priceDecimal(patch.purchaseCost);
  if (patch.coverColorHex !== undefined) {
    variantData.options = {
      ...(existing.options as Prisma.JsonObject),
      colorHex: patch.coverColorHex,
    };
  }

  await tx.stockItem.update({ where: { id: existing.itemId }, data: itemData });
  if (Object.keys(variantData).length > 0) {
    await tx.stockVariant.update({ where: { id: existing.id }, data: variantData });
  }
  if (patch.stockQuantity !== undefined) {
    await adjustToActual(tx, {
      variantId: existing.id,
      actualQuantity: patch.stockQuantity,
      note: STOCKTAKE_NOTE,
      createdById,
    });
  }
  return (await loadNotebookVariantForAdmin(tx, existing.id))!;
}

/** A copy is a new catalog row with zero stock (not a second pile of the same notebooks). */
export async function duplicateNotebookCatalogItem(
  tx: Tx,
  source: NotebookVariantWithItem,
  sku: string,
  createdById: string | null,
): Promise<NotebookVariantWithItem> {
  const a: NotebookAttributes = parseNotebookAttributes(source.item.attributes);
  const num = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d.toString()));
  return createNotebookCatalogItem(
    tx,
    {
      sku,
      nameRo: source.item.nameRo,
      nameRu: source.item.nameRu,
      nameEn: source.item.nameEn,
      stockQuantity: 0,
      sellPrice: num(source.sellPrice),
      dealerPrice: num(source.dealerPrice),
      purchaseCost: num(source.purchaseCost),
      imageUrl: source.item.imageUrl,
      ...a,
      uvPrintNorms: parseUvPrintNorms(source.item.attributes),
      isActive: source.isActive && source.item.isActive,
      sortOrder: source.item.sortOrder,
      internalNotes: source.item.internalNotes,
    },
    createdById,
  );
}
