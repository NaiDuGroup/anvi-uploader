import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canListLargeFormatMaterials, canManageMugCatalog } from "@/lib/roles";
import { toAdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";

const sheetSizeCm = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const createBody = z.object({
  name: z.string().min(1).max(200),
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
    const rows = await prisma.sheetPaper.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
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
    const row = await prisma.sheetPaper.create({
      data: {
        name: body.name.trim(),
        sheetWidthCm: body.sheetWidthCm,
        sheetHeightCm: body.sheetHeightCm,
        costPerSheet: body.costPerSheet,
        retailPricePerSheet: body.retailPricePerSheet,
        dealerPricePerSheet: body.dealerPricePerSheet,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
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
    console.error("POST /api/admin/sheet-papers:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
