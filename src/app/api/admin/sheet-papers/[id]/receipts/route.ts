import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: sheetPaperId } = await params;

  const paper = await prisma.sheetPaper.findUnique({
    where: { id: sheetPaperId },
    select: { id: true },
  });
  if (!paper) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await prisma.sheetPaperStockReceipt.findMany({
    where: { sheetPaperId },
    orderBy: { purchasedAt: "desc" },
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
  });

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      quantitySheets: Number(r.quantitySheets),
      totalCostMdl: r.totalCostMdl,
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
    })),
  });
}
