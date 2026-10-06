import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { recordSheetPaperStockReceipt } from "@/lib/businessCard/sheetPaperStockReceipt";

const bodySchema = z.object({
  quantitySheets: z.number().positive().max(1_000_000),
  totalCostMdl: z.number().int().min(0).max(999_999_999),
  purchasedAt: z.coerce.date(),
  supplier: z.string().max(500).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id: sheetPaperId } = await params;
    const paper = await prisma.sheetPaper.findUnique({
      where: { id: sheetPaperId },
      select: { id: true },
    });
    if (!paper) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const parsed = bodySchema.parse(await request.json());

    const actor = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await recordSheetPaperStockReceipt(tx, {
        sheetPaperId,
        quantitySheets: parsed.quantitySheets,
        totalCostMdl: parsed.totalCostMdl,
        purchasedAt: parsed.purchasedAt,
        supplier: parsed.supplier ?? null,
        note: parsed.note ?? null,
        createdById: actor?.id ?? null,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: error.flatten() },
        { status: 400 },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return NextResponse.json(
        { error: "database_schema_outdated", hint: "Run: npm run db:prepare" },
        { status: 503 },
      );
    }
    console.error("sheet paper receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
