import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { STOCK_VARIANTS_ORDER, toStockItemJson } from "@/lib/stock/unified/adminJson";
import { copySupplierPhotoToCatalog } from "@/lib/imports/importStorage";
import {
  fetchGorFactoryDescription,
  gorFactoryColourShotUrl,
  gorFactoryGalleryUrls,
  gorFactoryModelCode,
  loadGorFactoryCatalog,
  type GorFactoryCatalog,
} from "@/lib/imports/gorFactoryMedia";
import { parseStockItemDescription } from "@/lib/stock/unified/itemDescription";

const bodySchema = z.object({
  /** One item (the «Подтянуть» button in its card); overwrites photos and description. */
  itemId: z.string().uuid().optional(),
  /** Bulk: how many not-yet-synced items to handle in this call. */
  limit: z.number().int().min(1).max(10).default(4),
});

/** Items with a supplier article that were never synced (bulk run). */
const PENDING_WHERE: Prisma.StockItemWhereInput = {
  supplierMediaAt: null,
  variants: { some: { supplierCode: { not: null } } },
};

type ItemResult = { itemId: string; name: string; photos: number; description: boolean; error?: string };

/** Copies the supplier photos (a few at a time); keys in gallery order, failed ones skipped. */
async function copyAll(urls: string[], code: string): Promise<string[]> {
  const keys: (string | null)[] = new Array(urls.length).fill(null);
  for (let i = 0; i < urls.length; i += 4) {
    const batch = urls.slice(i, i + 4);
    const copied = await Promise.all(batch.map((u) => copySupplierPhotoToCatalog(u, code).catch(() => null)));
    copied.forEach((k, j) => (keys[i + j] = k));
  }
  return keys.filter((k): k is string => k != null);
}

async function syncItem(itemId: string, catalog: GorFactoryCatalog, overwrite: boolean): Promise<ItemResult> {
  const item = await prisma.stockItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { variants: { orderBy: STOCK_VARIANTS_ORDER, select: { supplierCode: true } } },
  });
  const result: ItemResult = { itemId, name: item.nameRu, photos: 0, description: false };
  const code: string | undefined = item.variants.map((v) => v.supplierCode).find((c): c is string => !!c);
  const modelCode: string | null = code ? gorFactoryModelCode(code) : null;
  if (!code || !modelCode) {
    await prisma.stockItem.update({ where: { id: itemId }, data: { supplierMediaAt: new Date() } });
    return { ...result, error: "no_supplier_code" };
  }

  // The colour shot is already the main photo when the item came from an import: keep it, copy the rest.
  const all: string[] = gorFactoryGalleryUrls(catalog, code);
  const colourShot: string | null = gorFactoryColourShotUrl(catalog, code);
  const hasMain = !!item.imageUrl;
  const urls: string[] = hasMain ? all.filter((u) => u !== colourShot) : all;
  const keys: string[] = await copyAll(urls, code);
  const imageUrl: string | null = hasMain ? item.imageUrl : (keys[0] ?? null);
  const gallery: string[] = hasMain ? keys : keys.slice(1);

  const fetched = await fetchGorFactoryDescription(modelCode);
  const current = parseStockItemDescription(item.description);
  const description = overwrite ? (fetched ?? current) : (current ?? fetched);

  await prisma.stockItem.update({
    where: { id: itemId },
    data: {
      imageUrl,
      galleryImages: keys.length > 0 || overwrite ? gallery : item.galleryImages,
      description: description ?? Prisma.DbNull,
      supplierMediaAt: new Date(),
    },
  });
  return { ...result, photos: (imageUrl ? 1 : 0) + gallery.length, description: !!description };
}

/**
 * POST: pull photos and the description of Gor Factory goods (Stamina / ROLY)
 * from the supplier's public catalog. With `itemId`: that item. Without: the
 * next `limit` items never synced; the page calls again until `remaining` is 0.
 */
export async function POST(request: NextRequest) {
  return stockRoute("POST /api/admin/stock/supplier-media", async () => {
    await requireStockManager();
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const catalog = await loadGorFactoryCatalog();

    if (body.itemId) {
      const exists = await prisma.stockItem.findUnique({ where: { id: body.itemId }, select: { id: true } });
      if (!exists) throw new StockApiError(404, "not_found");
      const res = await syncItem(body.itemId, catalog, true);
      const item = await prisma.stockItem.findUniqueOrThrow({
        where: { id: body.itemId },
        include: { variants: { orderBy: STOCK_VARIANTS_ORDER } },
      });
      return NextResponse.json({ result: res, item: toStockItemJson(item) });
    }

    const batch = await prisma.stockItem.findMany({
      where: PENDING_WHERE,
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: body.limit,
    });
    const results: ItemResult[] = [];
    for (const { id } of batch) {
      try {
        results.push(await syncItem(id, catalog, false));
      } catch (e) {
        await prisma.stockItem.update({ where: { id }, data: { supplierMediaAt: new Date() } }).catch(() => {});
        results.push({ itemId: id, name: "", photos: 0, description: false, error: String(e).slice(0, 200) });
      }
    }
    const remaining: number = await prisma.stockItem.count({ where: PENDING_WHERE });
    return NextResponse.json({ results, remaining });
  });
}

/** GET: how many items with a supplier article are synced / not yet. */
export async function GET() {
  return stockRoute("GET /api/admin/stock/supplier-media", async () => {
    await requireStockManager();
    const [pending, total] = await Promise.all([
      prisma.stockItem.count({ where: PENDING_WHERE }),
      prisma.stockItem.count({ where: { variants: { some: { supplierCode: { not: null } } } } }),
    ]);
    return NextResponse.json({ pending, total });
  });
}
