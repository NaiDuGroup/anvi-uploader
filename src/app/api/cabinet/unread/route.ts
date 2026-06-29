import { NextResponse } from "next/server";
import { getCustomerSessionUser } from "@/lib/auth";
import { getTotalUnreadClientMessagesForCustomer } from "@/lib/clientMessagesUnread";

/**
 * Lightweight total of unread studio messages for the logged-in customer,
 * polled by the cabinet shell to drive the global badge + sound notification.
 */
export async function GET() {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const totalUnread = await getTotalUnreadClientMessagesForCustomer(
    user.studioCustomerId!,
    user.id,
  );

  return NextResponse.json({ totalUnread });
}
