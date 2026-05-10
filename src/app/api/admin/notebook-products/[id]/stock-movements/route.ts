import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageNotebookCatalog } from "@/lib/roles";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageNotebookCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: notebookProductId } = await params;
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(
    200,
    Math.max(1, parseInt(limitRaw ?? "80", 10) || 80),
  );

  const product = await prisma.notebookProduct.findUnique({
    where: { id: notebookProductId },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const movements = await prisma.notebookStockMovement.findMany({
    where: { notebookProductId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      delta: true,
      kind: true,
      orderNumber: true,
      note: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ movements });
}
