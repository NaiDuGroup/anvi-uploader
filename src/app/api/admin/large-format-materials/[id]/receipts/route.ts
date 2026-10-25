import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";

/** Purchase receipts of a roll, from its unified stock variant (newest first). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: materialId } = await params;

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

  const rows = await prisma.stockReceipt.findMany({
    where: { variantId: m.stockVariantId },
    orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      quantityLinearMeters: Number(r.quantity.toString()),
      totalCostMdl: Number(r.totalCostMdl.toString()),
      purchasedAt: r.purchasedAt.toISOString().slice(0, 10),
      supplier: r.supplierName,
      note: r.note,
      isProvisional: r.isProvisional,
      fromInvoice: r.purchaseInvoiceLineId != null,
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
