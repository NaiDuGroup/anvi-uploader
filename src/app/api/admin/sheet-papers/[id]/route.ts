import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";

const sheetSizeCm = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const patchBody = z.object({
  name: z.string().min(1).max(200).optional(),
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
    const row = await prisma.sheetPaper.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.sheetWidthCm !== undefined
          ? { sheetWidthCm: body.sheetWidthCm }
          : {}),
        ...(body.sheetHeightCm !== undefined
          ? { sheetHeightCm: body.sheetHeightCm }
          : {}),
        ...(body.costPerSheet !== undefined
          ? { costPerSheet: body.costPerSheet }
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
    await prisma.sheetPaper.delete({ where: { id } });
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
