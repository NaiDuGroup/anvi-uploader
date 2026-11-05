import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canViewShopAdmin } from "@/lib/shop/report/access";
import { shopOrdersCsv } from "@/lib/shop/report/orders";
import { loadPriorPaidKeys, loadShopOrdersReport, loadShopReportOrders } from "@/lib/shop/report/ordersServer";
import { parseShopReportPeriod } from "@/lib/shop/report/period";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Admin «Сайт: заказы и воронка» — orders section.
 * `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&includeTest=1&lang=ru|ro|en` (Chișinău days; default
 * the last 30 days; test orders left out unless `includeTest=1`) → JSON
 * (`ShopOrdersReport`, product names in `lang`, default ru), or with `format=csv` one CSV row per order.
 * Studio admin + superadmin only.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!canViewShopAdmin(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });

  const sp = request.nextUrl.searchParams;
  const period = parseShopReportPeriod(sp.get("from"), sp.get("to"));
  if ("error" in period) return NextResponse.json({ error: period.error }, { status: 400, headers: NO_STORE });
  const includeTest = sp.get("includeTest") === "1";
  const langParam = sp.get("lang");
  const lang = langParam === "ro" || langParam === "en" ? langParam : "ru";

  try {
    if (sp.get("format") === "csv") {
      const rows = await loadShopReportOrders(period);
      const priorPaidKeys = await loadPriorPaidKeys(rows, period.start);
      return new NextResponse(shopOrdersCsv(rows, { includeTest, priorPaidKeys }), {
        headers: {
          ...NO_STORE,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="anvi-zakazy-sayt-${period.from}_${period.to}.csv"`,
        },
      });
    }
    return NextResponse.json(await loadShopOrdersReport(period, includeTest, lang), { headers: NO_STORE });
  } catch (error) {
    console.error("[admin-shop-report] failed:", error);
    return NextResponse.json({ error: "report_failed" }, { status: 500, headers: NO_STORE });
  }
}
