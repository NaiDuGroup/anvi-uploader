import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { StockMovementKind } from "@/lib/stock/unified/kinds";

/**
 * Stock movements of a roll (orders, returns, backlog, layout transfers,
 * stocktakes…), from its unified stock variant. Receipts are listed by
 * `…/receipts`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: materialId } = await params;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(limitRaw ?? "80", 10) || 80),
  );

  const m = await prisma.largeFormatMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, stockVariantId: true },
  });
  if (!m) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!m.stockVariantId) {
    return NextResponse.json({ items: [] });
  }

  const rows = await prisma.stockMovement.findMany({
    where: { variantId: m.stockVariantId, kind: { not: StockMovementKind.Receipt } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      delta: true,
      kind: true,
      orderId: true,
      orderNumber: true,
      costMdl: true,
      note: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      quantityLinearMeters: Number(r.delta.toString()),
      kind: r.kind,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      materialCostMdl: r.costMdl == null ? null : Math.round(Number(r.costMdl.toString())),
      /** The unified ledger keeps cost only; sell prices live on the order line. */
      materialSellPriceMdl: null,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy
        ? {
            id: r.createdBy.id,
            name: r.createdBy.displayName?.trim() || r.createdBy.name,
          }
        : null,
    })),
  });
}
