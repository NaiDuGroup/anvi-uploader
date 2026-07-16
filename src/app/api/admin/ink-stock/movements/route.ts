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
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const offsetRaw = request.nextUrl.searchParams.get("offset");
  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(limitRaw ?? "80", 10) || 80),
  );
  const offset = Math.max(0, Number.parseInt(offsetRaw ?? "0", 10) || 0);

  const where = { inkInventoryId: printProcess };

  const [total, rows] = await Promise.all([
    prisma.inkStockMovement.count({ where }),
    prisma.inkStockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        quantityMl: true,
        kind: true,
        orderId: true,
        orderNumber: true,
        inkCostMdl: true,
        inkSellPriceMdl: true,
        note: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, displayName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    printProcess,
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    items: rows.map((r) => ({
      id: r.id,
      quantityMl: Number(r.quantityMl),
      kind: r.kind,
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      inkCostMdl: r.inkCostMdl,
      inkSellPriceMdl: r.inkSellPriceMdl,
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
