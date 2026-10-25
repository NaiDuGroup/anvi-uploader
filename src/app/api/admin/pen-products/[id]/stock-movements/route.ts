import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { CatalogStockMovementItem } from "@/lib/stock/catalogStockReceiptSchema";
import { getSessionUser } from "@/lib/auth";
import { canManagePenCatalog } from "@/lib/roles";
import { resolvePenVariantId } from "@/lib/pen/penVariant";

/** Ledger of one pen (unified `StockMovement` rows of its variant). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManagePenCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(
    200,
    Math.max(1, parseInt(limitRaw ?? "80", 10) || 80),
  );

  const variantId: string | null = await resolvePenVariantId(prisma, rawId);
  if (!variantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const movements = await prisma.stockMovement.findMany({
    where: { variantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      delta: true,
      kind: true,
      orderNumber: true,
      costMdl: true,
      note: true,
      createdAt: true,
    },
  });

  const items: CatalogStockMovementItem[] = movements.map((m) => ({
    id: m.id,
    delta: Number(m.delta),
    kind: m.kind,
    orderNumber: m.orderNumber,
    costMdl: m.costMdl == null ? null : Number(m.costMdl),
    note: m.note,
    createdAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({ movements: items });
}
