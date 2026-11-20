import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchOrderOverview } from "@/lib/workshopBoard/fetchOrderOverview";
import { canOpenOrderOverview } from "@/lib/workshopBoard/orderOverviewAccess";

/**
 * Workshop board «Весь заказ» panel: one order with all its lines (read-only).
 *
 * Same roles as the board page (workshop + super admin); the workshop only
 * sees workshop orders and never gets prices, payment state or money history
 * (filtered here, not in the UI).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canOpenOrderOverview(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const overview = await fetchOrderOverview(id, user);
    if (!overview) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("workshop order overview failed:", error);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}
