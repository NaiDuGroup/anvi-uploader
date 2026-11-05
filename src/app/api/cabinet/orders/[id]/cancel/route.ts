import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCustomerSessionUser } from "@/lib/auth";
import { dealerOrderCancelSchema } from "@/lib/validations";
import { DealerOrderModifyError, dealerCancelOrder } from "@/lib/orderCreate/dealerOrderModify";
import { dealerModifyErrorResponse } from "@/lib/orderCreate/dealerOrderModifyHttp";

/**
 * Dealer cancels an own order from the cabinet, with a reason. Allowed only
 * until printing starts (`canDealerModifyOrder`). The order is soft-deleted
 * and marked cancelled (see `dealerCancelOrder`); another client's order
 * answers 404 like a missing one.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user || !user.studioCustomer || !user.studioCustomerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.studioCustomer.isDealer !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const body = dealerOrderCancelSchema.parse(await request.json().catch(() => ({})));
    const { cancelledAt } = await dealerCancelOrder({
      orderId: id,
      actor: { userId: user.id, studioCustomerId: user.studioCustomerId },
      reason: body.reason,
    });
    return NextResponse.json({ id, cancelledAt: cancelledAt.toISOString() });
  } catch (error) {
    if (error instanceof DealerOrderModifyError) return dealerModifyErrorResponse(error);
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "A cancellation reason is required", code: "cancel_reason_required" },
        { status: 400 },
      );
    }
    console.error("Failed to cancel dealer order:", error);
    return NextResponse.json({ error: "Failed to cancel order" }, { status: 500 });
  }
}
