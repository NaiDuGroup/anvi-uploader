import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchWorkshopBoardData } from "@/lib/fetchWorkshopBoardData";

/**
 * Workshop board grouped feed.
 *
 * Returns `WorkshopBoardData` — a tree of sections (by product type)
 * → groups (by material / SKU) → lines (individual OrderLine items).
 *
 * Both `workshop` and `admin` roles may call this endpoint.
 * The board always scopes to `is_workshop = true` orders.
 */
export async function GET(request: NextRequest) {
  const handlerStartedAt = Date.now();

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const result = await fetchWorkshopBoardData(user, {
    search: searchParams.get("search") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    includeDelivered: searchParams.get("includeDelivered") === "true",
  });

  const totalMs = Date.now() - handlerStartedAt;
  const response = NextResponse.json(result);
  response.headers.set("Server-Timing", `workshopBoard;dur=${totalMs.toFixed(1)}`);
  return response;
}
