import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import type { CatalogStockReceiptItem } from "@/lib/stock/catalogStockReceiptSchema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: mugProductId } = await params;
  const product = await prisma.mugProduct.findUnique({
    where: { id: mugProductId },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await prisma.mugStockReceipt.findMany({
    where: { mugProductId },
    orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
  });

  const items: CatalogStockReceiptItem[] = rows.map((r) => {
    const totalCostMdl: number = Number(r.totalCostMdl);
    return {
      id: r.id,
      quantity: r.quantity,
      totalCostMdl,
      unitCostMdl: r.quantity > 0 ? Math.round((totalCostMdl / r.quantity) * 100) / 100 : 0,
      purchasedAt: r.purchasedAt.toISOString().slice(0, 10),
      supplier: r.supplier,
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
