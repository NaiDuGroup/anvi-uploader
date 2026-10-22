import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { recordMugStockReceipt } from "@/lib/mug/mugStockLedger";
import { allocateMugProcurementBacklog } from "@/lib/allocateProcurementAfterReceipt";
import {
  catalogStockReceiptBodySchema,
  type CatalogStockReceiptBody,
} from "@/lib/stock/catalogStockReceiptSchema";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: CatalogStockReceiptBody = catalogStockReceiptBodySchema.parse(
      await request.json(),
    );

    const ids: string[] = [...new Set(body.lines.map((l) => l.productId))];
    const existing = await prisma.mugProduct.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json({ error: "unknown_product" }, { status: 400 });
    }

    const amountsIncludeVat: boolean = await purchaseCostsIncludeVat();
    await prisma.$transaction(async (tx) => {
      for (const line of body.lines) {
        await recordMugStockReceipt(tx, {
          mugProductId: line.productId,
          quantity: line.quantity,
          totalCostMdl: line.totalCostMdl,
          purchasedAt: body.purchasedAt,
          supplier: body.supplier ?? null,
          note: body.note ?? null,
          createdById: user.id,
          isProvisional: body.isProvisional ?? false,
          amountsIncludeVat,
        });
        await allocateMugProcurementBacklog(tx, {
          mugProductId: line.productId,
          createdById: user.id,
        });
      }
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
    console.error("mug-stock receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
