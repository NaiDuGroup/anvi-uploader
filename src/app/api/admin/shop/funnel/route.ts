import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { shopFunnelCsv } from "@/lib/shop/analytics/funnelCsv";
import { loadShopFunnelReport } from "@/lib/shop/analytics/funnelServer";
import { canViewShopAdmin } from "@/lib/shop/report/access";
import { parseShopReportPeriod } from "@/lib/shop/report/period";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Admin «Сайт: заказы и воронка» — funnel section. `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD`
 * (Chișinău days; default the last 30 days) → JSON (`ShopFunnelReport`), or
 * a CSV file with `format=csv`. Studio admin + superadmin only.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!canViewShopAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });

  const sp = request.nextUrl.searchParams;
  const period = parseShopReportPeriod(sp.get("from"), sp.get("to"));
  if ("error" in period) return NextResponse.json({ error: period.error }, { status: 400, headers: NO_STORE });

  try {
    const report = await loadShopFunnelReport(period);
    if (sp.get("format") === "csv") {
      return new NextResponse(shopFunnelCsv(report), {
        headers: {
          ...NO_STORE,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="anvi-voronka-${period.from}_${period.to}.csv"`,
        },
      });
    }
    return NextResponse.json(report, { headers: NO_STORE });
  } catch (error) {
    console.error("[admin-shop-funnel] failed:", error);
    return NextResponse.json({ error: "report_failed" }, { status: 500, headers: NO_STORE });
  }
}
