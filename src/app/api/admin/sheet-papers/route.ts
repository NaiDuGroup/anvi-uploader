import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canListLargeFormatMaterials, canManageMugCatalog } from "@/lib/roles";
import { toAdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";
import { findSheetPaperPricing, findSheetPapersPricing } from "@/lib/businessCard/sheetPaperStock";
import {
  createMaterialStockVariant,
  LEGACY_COST_COLUMN_PLACEHOLDER,
  SHEET_PAPER_CATEGORY_CODE,
  SHEET_PAPER_LEGACY_KIND,
  sheetPaperStockAttributes,
} from "@/lib/stock/unified/materials";
import {
  SHEET_PAPER_GSM_MAX,
  SHEET_PAPER_GSM_MIN,
} from "@/lib/sheetProduct/sheetProductConfig";

const sheetSizeCm = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const createBody = z.object({
  name: z.string().min(1).max(200),
  gsm: z.number().int().min(SHEET_PAPER_GSM_MIN).max(SHEET_PAPER_GSM_MAX).nullable().optional(),
  sheetWidthCm: sheetSizeCm,
  sheetHeightCm: sheetSizeCm,
  costPerSheet: z.number().int().min(0).max(99_999_999).default(0),
  retailPricePerSheet: z.number().int().min(0).max(99_999_999).default(0),
  dealerPricePerSheet: z.number().int().min(0).max(99_999_999).default(0),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user || !canListLargeFormatMaterials(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Balance and cost come from each paper's unified stock variant.
    const rows = await findSheetPapersPricing(prisma);
    return NextResponse.json({ items: rows.map(toAdminSheetPaperJson) });
  } catch (e) {
    console.error("GET /api/admin/sheet-papers:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createBody.parse(await request.json());
    // Paper row + its «Листовая бумага» stock item / variant, linked.
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.sheetPaper.create({
        data: {
          name: body.name.trim(),
          gsm: body.gsm ?? null,
          sheetWidthCm: body.sheetWidthCm,
          sheetHeightCm: body.sheetHeightCm,
          // Cost hint lives on the stock variant; the legacy column only needs a value.
          costPerSheet: LEGACY_COST_COLUMN_PLACEHOLDER,
          retailPricePerSheet: body.retailPricePerSheet,
          dealerPricePerSheet: body.dealerPricePerSheet,
          isActive: body.isActive ?? true,
          sortOrder: body.sortOrder ?? 0,
        },
        select: { id: true },
      });
      const stockVariantId: string = await createMaterialStockVariant(tx, {
        categoryCode: SHEET_PAPER_CATEGORY_CODE,
        legacyKind: SHEET_PAPER_LEGACY_KIND,
        legacyId: created.id,
        skuPrefix: "PAPER",
        name: body.name,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
        attributes: sheetPaperStockAttributes({
          sheetWidthCm: body.sheetWidthCm,
          sheetHeightCm: body.sheetHeightCm,
          gsm: body.gsm ?? null,
        }),
        purchaseCost: body.costPerSheet,
      });
      await tx.sheetPaper.update({ where: { id: created.id }, data: { stockVariantId } });
      return (await findSheetPaperPricing(tx, created.id))!;
    });
    return NextResponse.json({ item: toAdminSheetPaperJson(row) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/sheet-papers:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
