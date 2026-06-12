import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchWorkshopSidebarData } from "@/lib/fetchWorkshopSidebar";
import type { OrderStatus } from "@/lib/validations";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

/**
 * Workshop-sidebar feed for the admin orders page.
 *
 * The main `/api/orders` payload no longer carries this list on the client's
 * 10-second polling cadence. Instead the admin page polls this endpoint on a
 * slower 30-second interval, which strips a CTE round-trip and (in the worst
 * case) a second `findMany` from every main-list refresh.
 *
 * Workshop role accounts have no sidebar — they receive `{ workshopOrders: [] }`.
 */
export async function GET(request: NextRequest) {
  const handlerStartedAt = Date.now();

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusesParam = searchParams.get("statuses")?.trim() ?? "";

  const result = await fetchWorkshopSidebarData(user, {
    search: searchParams.get("search") ?? "",
    onlyMine: searchParams.get("onlyMine") === "true",
    needsProcurementOnly: searchParams.get("needsProcurement") === "true",
    statuses: statusesParam ? (statusesParam.split(",") as OrderStatus[]) : [],
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
  });

  const totalMs = Date.now() - handlerStartedAt;
  const response = NextResponse.json(result);
  response.headers.set("Server-Timing", `workshopSidebar;dur=${totalMs.toFixed(1)}`);
  response.headers.set("X-Workshop-Sidebar-Server-Time-Ms", totalMs.toFixed(1));
  return response;
}
