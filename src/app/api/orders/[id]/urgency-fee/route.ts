import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { waiveDealerUrgencyFee, WaiveUrgencyError } from "@/lib/dealerUrgencyStaff";

/**
 * Staff waive of the dealer «Срочно» fee (`DELETE` = the fee goes): the order
 * stays urgent, the fee becomes 0 and leaves the price / debt, logged.
 * Every staff role (admin, superadmin, workshop) — the same users who may
 * toggle 🔥 / edit the price via `PATCH /api/orders/[id]`. 409 on a paid order
 * or when there is no dealer fee.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const result = await waiveDealerUrgencyFee({ orderId: id, userId: user.id });
    return NextResponse.json({ id, price: result.price, waivedFeeMdl: result.waivedFeeMdl, urgencyFeeMdl: 0 });
  } catch (error) {
    if (error instanceof WaiveUrgencyError) {
      if (error.code === "not_found") return NextResponse.json({ error: "Order not found" }, { status: 404 });
      return NextResponse.json({ error: error.code, code: error.code }, { status: 409 });
    }
    console.error("Failed to waive urgency fee:", error);
    return NextResponse.json({ error: "Failed to waive urgency fee" }, { status: 500 });
  }
}
