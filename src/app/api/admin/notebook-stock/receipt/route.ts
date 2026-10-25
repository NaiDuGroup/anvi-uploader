import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageNotebookCatalog } from "@/lib/roles";
import { receive } from "@/lib/stock/unified/ledger";
import { allocateNotebookVariantProcurementBacklog } from "@/lib/notebook/notebookOrderStock";
import { resolveNotebookVariantId } from "@/lib/notebook/notebookVariant";
import {
  catalogStockReceiptBodySchema,
  type CatalogStockReceiptBody,
} from "@/lib/stock/catalogStockReceiptSchema";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";

/** Notebook delivery from the notebook catalog: unified receipts on each notebook's variant. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageNotebookCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: CatalogStockReceiptBody = catalogStockReceiptBodySchema.parse(
      await request.json(),
    );

    // `productId` is the notebook variant id (a legacy notebook id still resolves).
    const variantByProductId = new Map<string, string>();
    for (const productId of new Set(body.lines.map((l) => l.productId))) {
      const variantId: string | null = await resolveNotebookVariantId(prisma, productId);
      if (!variantId) {
        return NextResponse.json({ error: "unknown_product" }, { status: 400 });
      }
      variantByProductId.set(productId, variantId);
    }

    const amountsIncludeVat: boolean = await purchaseCostsIncludeVat();
    await prisma.$transaction(async (tx) => {
      for (const line of body.lines) {
        const variantId: string = variantByProductId.get(line.productId)!;
        await receive(tx, {
          variantId,
          quantity: line.quantity,
          totalCostMdl: line.totalCostMdl,
          purchasedAt: body.purchasedAt,
          supplierName: body.supplier ?? null,
          note: body.note ?? null,
          createdById: user.id,
          isProvisional: body.isProvisional ?? false,
          amountsIncludeVat,
        });
        await allocateNotebookVariantProcurementBacklog(tx, { variantId, createdById: user.id });
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
    console.error("notebook-stock receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
