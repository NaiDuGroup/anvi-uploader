import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";
import { findSheetPaperPricing } from "@/lib/businessCard/sheetPaperStock";
import {
  requireSheetPaperVariantId,
  retireMaterialStockVariant,
  syncMaterialStockVariant,
  sheetPaperStockAttributes,
} from "@/lib/stock/unified/materials";
import {
  SHEET_PAPER_GSM_MAX,
  SHEET_PAPER_GSM_MIN,
} from "@/lib/sheetProduct/sheetProductConfig";

const sheetSizeCm = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const patchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  gsm: z.number().int().min(SHEET_PAPER_GSM_MIN).max(SHEET_PAPER_GSM_MAX).nullable().optional(),
  sheetWidthCm: sheetSizeCm.optional(),
  sheetHeightCm: sheetSizeCm.optional(),
  costPerSheet: z.number().int().min(0).max(99_999_999).optional(),
  retailPricePerSheet: z.number().int().min(0).max(99_999_999).optional(),
  dealerPricePerSheet: z.number().int().min(0).max(99_999_999).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = patchBody.parse(await request.json());
    const row = await prisma.$transaction(async (tx) => {
      await tx.sheetPaper.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.gsm !== undefined ? { gsm: body.gsm } : {}),
          ...(body.sheetWidthCm !== undefined
            ? { sheetWidthCm: body.sheetWidthCm }
            : {}),
          ...(body.sheetHeightCm !== undefined
            ? { sheetHeightCm: body.sheetHeightCm }
            : {}),
          ...(body.retailPricePerSheet !== undefined
            ? { retailPricePerSheet: body.retailPricePerSheet }
            : {}),
          ...(body.dealerPricePerSheet !== undefined
            ? { dealerPricePerSheet: body.dealerPricePerSheet }
            : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        },
      });
      // Name, active flag, order, size / gsm and the cost hint follow onto the stock item / variant.
      const variantId: string = await requireSheetPaperVariantId(tx, id);
      await syncMaterialStockVariant(tx, variantId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.costPerSheet !== undefined ? { purchaseCost: body.costPerSheet } : {}),
        ...(body.sheetWidthCm !== undefined || body.sheetHeightCm !== undefined || body.gsm !== undefined
          ? {
              attributes: sheetPaperStockAttributes({
                ...(body.sheetWidthCm !== undefined ? { sheetWidthCm: body.sheetWidthCm } : {}),
                ...(body.sheetHeightCm !== undefined ? { sheetHeightCm: body.sheetHeightCm } : {}),
                ...(body.gsm !== undefined ? { gsm: body.gsm } : {}),
              }),
            }
          : {}),
      });
      return (await findSheetPaperPricing(tx, id))!;
    });
    return NextResponse.json({ item: toAdminSheetPaperJson(row) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: e.flatten() },
        { status: 400 },
      );
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("PATCH /api/admin/sheet-papers/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.sheetPaper.delete({ where: { id }, select: { stockVariantId: true } });
      // Stock item: removed when unused, otherwise kept inactive with its history.
      if (deleted.stockVariantId) await retireMaterialStockVariant(tx, deleted.stockVariantId);
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("DELETE /api/admin/sheet-papers/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
