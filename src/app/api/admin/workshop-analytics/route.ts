import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { parseShopReportPeriod } from "@/lib/shop/report/period";
import { loadWorkshopAnalytics } from "@/lib/workshopAnalytics/server";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * «Аналитика цеха»: `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&includeTest=1` (Chișinău
 * days, default the last 30) → `WorkshopAnalyticsReport`. Super admin only.
 * Computed on request (cached in-process ~5 min per period), never on order writes.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!isSuperAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });

  const sp = request.nextUrl.searchParams;
  const period = parseShopReportPeriod(sp.get("from"), sp.get("to"));
  if ("error" in period) return NextResponse.json({ error: period.error }, { status: 400, headers: NO_STORE });

  try {
    return NextResponse.json(await loadWorkshopAnalytics(period, sp.get("includeTest") === "1"), { headers: NO_STORE });
  } catch (error) {
    console.error("[workshop-analytics] failed:", error);
    return NextResponse.json({ error: "analytics_failed" }, { status: 500, headers: NO_STORE });
  }
}
