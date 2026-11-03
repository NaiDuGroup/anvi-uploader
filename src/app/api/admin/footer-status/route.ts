import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog, isAdmin } from "@/lib/roles";
import { FOOTER_STATUS_GROUPS, type FooterStatusCounts } from "@/lib/studioInfo/footerStatus";

/**
 * Slim admin footer: order counts by shift group + low-stock count.
 * One `groupBy` over live orders (workshop has studio-admin parity, so no
 * `isWorkshop` filter — same as `/api/orders`), plus one COUNT on stock for
 * roles that can open the stock section.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const byStatus = await prisma.order.groupBy({
    by: ["status"],
    where: { deletedAt: null, status: { not: "DELIVERED" } },
    _count: { _all: true },
  });
  const countOf = (statuses: readonly string[]) =>
    byStatus.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r._count._all, 0);

  let lowStock: number | null = null;
  if (canManageMugCatalog(user.role)) {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n
      FROM stock_variants
      WHERE is_active = true
        AND reorder_level IS NOT NULL
        AND stock_quantity <= reorder_level
    `;
    lowStock = Number(rows[0]?.n ?? 0);
  }

  const body: FooterStatusCounts = {
    new: countOf(FOOTER_STATUS_GROUPS.new),
    inWork: countOf(FOOTER_STATUS_GROUPS.inWork),
    ready: countOf(FOOTER_STATUS_GROUPS.ready),
    issue: countOf(FOOTER_STATUS_GROUPS.issue),
    lowStock,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
