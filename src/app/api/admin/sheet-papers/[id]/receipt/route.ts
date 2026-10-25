import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { receive } from "@/lib/stock/unified/ledger";
import { requireSheetPaperVariantId } from "@/lib/stock/unified/materials";
import { allocateVariantProcurementBacklog } from "@/lib/stock/unified/variantProcurementBacklog";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";

const bodySchema = z.object({
  // Sheets are counted whole in the unified stock («Листовая бумага», unit sheet).
  quantitySheets: z.number().int().positive().max(1_000_000),
  totalCostMdl: z.number().int().min(0).max(999_999_999),
  purchasedAt: z.coerce.date(),
  supplier: z.string().max(500).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  isProvisional: z.boolean().optional(),
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

    const amountsIncludeVat: boolean = await purchaseCostsIncludeVat();
    // Receipt on the paper's unified stock variant (weighted average, balance, RECEIPT movement).
    const createdById: string | null = actor?.id ?? null;
    const variantId: string = await prisma.$transaction(async (tx) => {
      const id: string = await requireSheetPaperVariantId(tx, sheetPaperId);
      await receive(tx, {
        variantId: id,
        quantity: parsed.quantitySheets,
        totalCostMdl: parsed.totalCostMdl,
        purchasedAt: parsed.purchasedAt,
        supplierName: parsed.supplier ?? null,
        note: parsed.note ?? null,
        createdById,
        isProvisional: parsed.isProvisional ?? false,
        amountsIncludeVat,
      });
      return id;
    });

    try {
      // Orders waiting for this paper (`sheet_paper` entries) take their sheets now.
      await prisma.$transaction((tx) => allocateVariantProcurementBacklog(tx, { variantId, createdById }));
    } catch (allocErr) {
      console.error("sheet paper allocate backlog after receipt:", allocErr);
    }

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
