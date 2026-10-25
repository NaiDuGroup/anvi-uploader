import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { resolveMugVariantId } from "@/lib/mug/mugVariant";
import type { CatalogStockReceiptItem } from "@/lib/stock/catalogStockReceiptSchema";

/** Purchase receipts of one mug (unified `StockReceipt` rows of its variant). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const variantId: string | null = await resolveMugVariantId(prisma, rawId);
  if (!variantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await prisma.stockReceipt.findMany({
    where: { variantId },
    orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
  });

  const items: CatalogStockReceiptItem[] = rows.map((r) => {
    const totalCostMdl: number = Number(r.totalCostMdl);
    const quantity: number = Number(r.quantity);
    return {
      id: r.id,
      quantity,
      totalCostMdl,
      unitCostMdl: quantity > 0 ? Math.round((totalCostMdl / quantity) * 100) / 100 : 0,
      purchasedAt: r.purchasedAt.toISOString().slice(0, 10),
      supplier: r.supplierName,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy
        ? {
            id: r.createdBy.id,
            name: r.createdBy.displayName?.trim() || r.createdBy.name,
          }
        : null,
    };
  });

  return NextResponse.json({ items });
}
