import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

const MAX_ORDER_IDS = 100;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_ORDER_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ invoiceLinksByOrderId: {} });
  }

  const rows = await prisma.invoiceLineItem.findMany({
    where: {
      orderId: { in: ids },
      invoice: { number: { not: null } },
    },
    select: {
      id: true,
      orderId: true,
      invoice: { select: { id: true, number: true } },
    },
  });

  const invoiceLinksByOrderId: Record<
    string,
    Array<{ id: string; invoice: { id: string; number: string | null } }>
  > = {};

  for (const row of rows) {
    if (!row.orderId) continue;
    const list = invoiceLinksByOrderId[row.orderId] ?? [];
    list.push({
      id: row.id,
      invoice: {
        id: row.invoice.id,
        number: row.invoice.number,
      },
    });
    invoiceLinksByOrderId[row.orderId] = list;
  }

  return NextResponse.json({ invoiceLinksByOrderId });
}
