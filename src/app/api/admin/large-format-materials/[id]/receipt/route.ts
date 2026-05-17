import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { recordLfRollStockReceipt } from "@/lib/largeFormat/lfRollStockReceipt";
import { allocateLfRollProcurementBacklog } from "@/lib/allocateProcurementAfterReceipt";

const bodySchema = z.object({
  quantityLinearMeters: z.number().positive().max(1_000_000),
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
    const { id: materialId } = await params;
    const m = await prisma.largeFormatMaterial.findUnique({
      where: { id: materialId },
      select: { id: true },
    });
    if (!m) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = bodySchema.parse(body);

    const actor = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    /** Prefer null over a bogus FK — receipts still save, audit user is optional. */
    let createdById: string | null = actor?.id ?? null;

    const saveReceipt = (cid: string | null) =>
      prisma.$transaction(async (tx) => {
        await recordLfRollStockReceipt(tx, {
          materialId,
          quantityLinearMeters: parsed.quantityLinearMeters,
          totalCostMdl: parsed.totalCostMdl,
          purchasedAt: parsed.purchasedAt,
          supplier: parsed.supplier ?? null,
          note: parsed.note ?? null,
          createdById: cid,
        });
      });

    try {
      await saveReceipt(createdById);
    } catch (first) {
      if (
        first instanceof Prisma.PrismaClientKnownRequestError &&
        first.code === "P2003" &&
        createdById !== null
      ) {
        createdById = null;
        await saveReceipt(null);
      } else {
        throw first;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await allocateLfRollProcurementBacklog(tx, { materialId });
      });
    } catch (allocErr) {
      console.error("lf_roll allocate backlog after receipt:", allocErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021" || error.code === "P2022") {
        return NextResponse.json(
          { error: "database_schema_outdated", hint: "Run: npm run db:prepare" },
          { status: 503 },
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          {
            error: "foreign_key_violation",
            hint: "Receipt references a user or material row that is missing in the database.",
          },
          { status: 409 },
        );
      }
    }
    console.error("lf roll receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
