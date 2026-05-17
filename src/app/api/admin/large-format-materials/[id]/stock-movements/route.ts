import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";

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
    select: { id: true },
  });
  if (!m) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await prisma.lfRollStockMovement.findMany({
    where: { materialId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      quantityLinearMeters: true,
      kind: true,
      orderId: true,
      orderNumber: true,
      materialCostMdl: true,
      materialSellPriceMdl: true,
      note: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      quantityLinearMeters: Number(r.quantityLinearMeters),
      kind: r.kind,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      materialCostMdl: r.materialCostMdl,
      materialSellPriceMdl: r.materialSellPriceMdl,
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
