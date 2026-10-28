import { Prisma, type PrismaClient } from "@prisma/client";
import { parsePrintMethods, type PrintMethod } from "@/lib/stock/unified/printMethods";
import { adjustToActual } from "@/lib/stock/unified/ledger";
import {
  MUG_VARIANT_INCLUDE,
  MUG_VARIANT_WHERE,
  mugAttributesJson,
  parseMugAttributes,
  requireMugsCategoryId,
  type MugAttributes,
  type MugVariantWithItem,
} from "./mugVariant";

/**
 * Admin mug catalog writes on the unified stock: a mug is one
 * `StockItem` in category `mugs` with exactly one `StockVariant` (same
 * sku). Balance changes go through the ledger (stocktake = `adjustToActual`).
 */

type Tx = Prisma.TransactionClient;

export type MugCatalogFields = {
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  stockQuantity: number;
  sellPrice: number | null;
  dealerPrice: number | null;
  purchaseCost: number | null;
  imageUrl: string | null;
  bodyColorHex: string;
  handleColorHex: string;
  innerColorHex: string | null;
  rimColorHex: string | null;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
  /** Own print methods; [] = the category's (sublimation). */
  printMethods?: PrintMethod[];
};

export type MugCatalogPatch = Partial<MugCatalogFields>;

const STOCKTAKE_NOTE = "Остаток из каталога кружек";

function priceDecimal(value: number | null): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value.toFixed(2));
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const t: string = value?.trim() ?? "";
  return t === "" ? null : t;
}

/** Mug SKUs are stored upper-case (as in the legacy catalog). */
function normalizedSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function attributesOf(f: MugCatalogFields): MugAttributes {
  return {
    bodyColorHex: f.bodyColorHex,
    handleColorHex: f.handleColorHex,
    innerColorHex: f.innerColorHex,
    rimColorHex: f.rimColorHex,
    printWidthCm: f.printWidthCm,
    printHeightCm: f.printHeightCm,
    printDpi: f.printDpi,
    has3dPreview: f.has3dPreview,
  };
}

export async function loadMugVariantForAdmin(
  tx: Tx | PrismaClient,
  variantId: string,
): Promise<MugVariantWithItem | null> {
  return tx.stockVariant.findFirst({
    where: { id: variantId, ...MUG_VARIANT_WHERE },
    include: MUG_VARIANT_INCLUDE,
  });
}

export async function createMugCatalogItem(
  tx: Tx,
  f: MugCatalogFields,
  createdById: string | null,
): Promise<MugVariantWithItem> {
  const categoryId: string = await requireMugsCategoryId(tx);
  const sku: string = normalizedSku(f.sku);
  const item = await tx.stockItem.create({
    data: {
      categoryId,
      sku,
      nameRo: f.nameRo.trim(),
      nameRu: f.nameRu.trim(),
      nameEn: f.nameEn.trim(),
      imageUrl: trimmedOrNull(f.imageUrl),
      attributes: mugAttributesJson(attributesOf(f)),
      isSellable: true,
      isActive: f.isActive,
      sortOrder: f.sortOrder,
      internalNotes: trimmedOrNull(f.internalNotes),
      printMethods: f.printMethods ?? [],
      variants: {
        create: {
          sku,
          options: { colorHex: f.bodyColorHex },
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
  return (await loadMugVariantForAdmin(tx, variantId))!;
}

export async function updateMugCatalogItem(
  tx: Tx,
  existing: MugVariantWithItem,
  patch: MugCatalogPatch,
  createdById: string | null,
): Promise<MugVariantWithItem> {
  const attrs: MugAttributes = { ...parseMugAttributes(existing.item.attributes) };
  if (patch.bodyColorHex !== undefined) attrs.bodyColorHex = patch.bodyColorHex;
  if (patch.handleColorHex !== undefined) attrs.handleColorHex = patch.handleColorHex;
  if (patch.innerColorHex !== undefined) attrs.innerColorHex = patch.innerColorHex;
  if (patch.rimColorHex !== undefined) attrs.rimColorHex = patch.rimColorHex;
  if (patch.printWidthCm !== undefined) attrs.printWidthCm = patch.printWidthCm;
  if (patch.printHeightCm !== undefined) attrs.printHeightCm = patch.printHeightCm;
  if (patch.printDpi !== undefined) attrs.printDpi = patch.printDpi;
  if (patch.has3dPreview !== undefined) attrs.has3dPreview = patch.has3dPreview;

  const itemData: Prisma.StockItemUpdateInput = {
    // Keep unknown attribute keys other tools may have added.
    attributes: {
      ...(existing.item.attributes as Prisma.JsonObject),
      ...mugAttributesJson(attrs),
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
  if (patch.printMethods !== undefined) itemData.printMethods = patch.printMethods;
  if (patch.isActive !== undefined) {
    itemData.isActive = patch.isActive;
    variantData.isActive = patch.isActive;
  }
  if (patch.sellPrice !== undefined) variantData.sellPrice = priceDecimal(patch.sellPrice);
  if (patch.dealerPrice !== undefined) variantData.dealerPrice = priceDecimal(patch.dealerPrice);
  if (patch.purchaseCost !== undefined) variantData.purchaseCost = priceDecimal(patch.purchaseCost);
  if (patch.bodyColorHex !== undefined) {
    variantData.options = {
      ...(existing.options as Prisma.JsonObject),
      colorHex: patch.bodyColorHex,
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
  return (await loadMugVariantForAdmin(tx, existing.id))!;
}

/** A copy is a new catalog row with zero stock (not a second pile of the same mugs). */
export async function duplicateMugCatalogItem(
  tx: Tx,
  source: MugVariantWithItem,
  sku: string,
  createdById: string | null,
): Promise<MugVariantWithItem> {
  const a: MugAttributes = parseMugAttributes(source.item.attributes);
  const num = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d.toString()));
  return createMugCatalogItem(
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
      isActive: source.isActive && source.item.isActive,
      sortOrder: source.item.sortOrder,
      internalNotes: source.item.internalNotes,
      printMethods: parsePrintMethods(source.item.printMethods),
    },
    createdById,
  );
}
