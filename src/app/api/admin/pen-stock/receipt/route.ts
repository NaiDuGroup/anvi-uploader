import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManagePenCatalog } from "@/lib/roles";
import { receive } from "@/lib/stock/unified/ledger";
import { allocatePenVariantProcurementBacklog } from "@/lib/pen/penOrderStock";
import { resolvePenVariantId } from "@/lib/pen/penVariant";
import {
  catalogStockReceiptBodySchema,
  type CatalogStockReceiptBody,
} from "@/lib/stock/catalogStockReceiptSchema";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";

/** Pen delivery from the pen catalog: unified receipts on each pen's variant. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManagePenCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: CatalogStockReceiptBody = catalogStockReceiptBodySchema.parse(
      await request.json(),
    );

    // `productId` is the pen variant id (a legacy pen id still resolves).
    const variantByProductId = new Map<string, string>();
    for (const productId of new Set(body.lines.map((l) => l.productId))) {
      const variantId: string | null = await resolvePenVariantId(prisma, productId);
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
        await allocatePenVariantProcurementBacklog(tx, { variantId, createdById: user.id });
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
    console.error("pen-stock receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
