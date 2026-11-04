import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** `GET /api/orders/[id]/emails` (staff): customer e-mails sent for a storefront order, newest first. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await prisma.emailLog.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, to: true, template: true, status: true, provider: true, error: true, createdAt: true },
  });
  return NextResponse.json({ emails: rows }, { headers: { "Cache-Control": "no-store" } });
}
