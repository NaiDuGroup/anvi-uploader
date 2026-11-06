import { NextResponse } from "next/server";
import { getCustomerSessionUser } from "@/lib/auth";
import { getTotalUnreadClientMessagesForCustomer } from "@/lib/clientMessagesUnread";
import { cabinetLayoutIssueOrders } from "@/lib/layoutIssueQueries";

/**
 * Lightweight total of unread studio messages for the logged-in customer,
 * polled by the cabinet shell to drive the global badge + sound notification.
 * Also the owner's orders waiting for a new layout («Нужен макет»): the red
 * banner on every cabinet page and the «Заказы» menu badge.
 */
export async function GET() {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [totalUnread, layoutIssueOrders] = await Promise.all([
    getTotalUnreadClientMessagesForCustomer(user.studioCustomerId!, user.id),
    cabinetLayoutIssueOrders(user.studioCustomerId!),
  ]);

  return NextResponse.json({ totalUnread, layoutIssueOrders });
}
