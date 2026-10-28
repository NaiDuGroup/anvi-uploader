import { Prisma, type PrismaClient } from "@prisma/client";
import { parseUvPrintNorms, uvPrintNormsAttributes, type UvPrintNorms } from "@/lib/uv/uvPrintNorms";
import { adjustToActual } from "@/lib/stock/unified/ledger";
import {
  PEN_ATTRIBUTE_DEFAULTS,
  PEN_VARIANT_INCLUDE,
  PEN_VARIANT_WHERE,
  parsePenAttributes,
  penAttributesJson,
  requirePensCategoryId,
  type PenAttributes,
  type PenVariantWithItem,
} from "./penVariant";

/**
 * Admin pen catalog writes on the unified stock: a pen is one `StockItem` in
 * category `pens` with exactly one `StockVariant` (same sku). Balance changes
 * go through the ledger (stocktake = `adjustToActual`).
 */

type Tx = Prisma.TransactionClient;

function uvNormsAttributes(norms: UvPrintNorms | undefined): Record<string, number | boolean> {
  return norms ? uvPrintNormsAttributes(norms) : {};
}

export type PenCatalogFields = {
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
  bodyColorHex: string;
  clipColorHex: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
};

export type PenCatalogPatch = Partial<PenCatalogFields>;

const STOCKTAKE_NOTE = "Остаток из каталога ручек";

function priceDecimal(value: number | null): Prisma.Decimal | null {
  return value == null || !Number.isFinite(value) ? null : new Prisma.Decimal(value.toFixed(2));
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const t: string = value?.trim() ?? "";
  return t === "" ? null : t;
}

export async function loadPenVariantForAdmin(
  tx: Tx | PrismaClient,
  variantId: string): Promise<PenVariantWithItem | null> {
  return tx.stockVariant.findFirst({
    where: { id: variantId, ...PEN_VARIANT_WHERE },
    include: PEN_VARIANT_INCLUDE,
  });
}

export async function createPenCatalogItem(
  tx: Tx,
  f: PenCatalogFields,
  createdById: string | null,
): Promise<PenVariantWithItem> {
  const categoryId: string = await requirePensCategoryId(tx);
  const sku: string = f.sku.trim();
  const attrs: PenAttributes = {
    bodyColorHex: f.bodyColorHex,
    clipColorHex: f.clipColorHex,
    printWidthCm: f.printWidthCm,
    printHeightCm: f.printHeightCm,
    printDpi: f.printDpi,
    has3dPreview: f.has3dPreview,
  };
  const item = await tx.stockItem.create({
    data: {
      categoryId,
      sku,
      nameRo: f.nameRo.trim(),
      nameRu: f.nameRu.trim(),
      nameEn: f.nameEn.trim(),
      imageUrl: trimmedOrNull(f.imageUrl),
      attributes: { ...penAttributesJson(attrs), ...uvNormsAttributes(f.uvPrintNorms) },
      isSellable: true,
      isActive: f.isActive,
      sortOrder: f.sortOrder,
      internalNotes: trimmedOrNull(f.internalNotes),
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
  return (await loadPenVariantForAdmin(tx, variantId))!;
}

export async function updatePenCatalogItem(
  tx: Tx,
  existing: PenVariantWithItem,
  patch: PenCatalogPatch,
  createdById: string | null,
): Promise<PenVariantWithItem> {
  const attrs: PenAttributes = { ...parsePenAttributes(existing.item.attributes) };
  if (patch.bodyColorHex !== undefined) attrs.bodyColorHex = patch.bodyColorHex;
  if (patch.clipColorHex !== undefined) attrs.clipColorHex = patch.clipColorHex;
  if (patch.printWidthCm !== undefined) attrs.printWidthCm = patch.printWidthCm;
  if (patch.printHeightCm !== undefined) attrs.printHeightCm = patch.printHeightCm;
  if (patch.printDpi !== undefined) attrs.printDpi = patch.printDpi;
  if (patch.has3dPreview !== undefined) attrs.has3dPreview = patch.has3dPreview;

  const itemData: Prisma.StockItemUpdateInput = {
    // Keep unknown attribute keys other tools may have added.
    attributes: {
      ...(existing.item.attributes as Prisma.JsonObject),
      ...penAttributesJson(attrs),
      ...uvNormsAttributes(patch.uvPrintNorms),
    },
  };
  const variantData: Prisma.StockVariantUpdateInput = {};
  if (patch.sku !== undefined) {
    itemData.sku = patch.sku.trim();
    variantData.sku = patch.sku.trim();
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
  return (await loadPenVariantForAdmin(tx, existing.id))!;
}

/** A copy is a new catalog row with zero stock (not a second pile of the same pens). */
export async function duplicatePenCatalogItem(
  tx: Tx,
  source: PenVariantWithItem,
  sku: string,
  createdById: string | null,
): Promise<PenVariantWithItem> {
  const a: PenAttributes = parsePenAttributes(source.item.attributes ?? PEN_ATTRIBUTE_DEFAULTS);
  const num = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d.toString()));
  return createPenCatalogItem(
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
