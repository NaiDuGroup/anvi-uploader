import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { DEFAULT_PRINT_PROCESS, parsePrintProcess } from "@/lib/printProcess";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = request.nextUrl.searchParams.get("printProcess");
  const printProcess = parsePrintProcess(raw ?? DEFAULT_PRINT_PROCESS);

  const rows = await prisma.inkStockReceipt.findMany({
    where: { inkInventoryId: printProcess },
    orderBy: { purchasedAt: "desc" },
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, displayName: true } },
    },
  });

  return NextResponse.json({
    printProcess,
    items: rows.map((r) => ({
      id: r.id,
      printProcess: r.inkInventoryId,
      quantityMl: Number(r.quantityMl),
      totalCostMdl: r.totalCostMdl,
      purchasedAt: r.purchasedAt.toISOString().slice(0, 10),
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
