import { NextResponse } from "next/server";
import { getCustomerSessionUser } from "@/lib/auth";
import { loadWizardBootstrap } from "@/lib/wizardBootstrap";
import { toDealerWizardBootstrap } from "@/lib/dealerWizardBootstrap";

/**
 * Catalog bundle of the order wizard for a logged-in dealer: the staff bundle
 * without purchase costs, ink / consumable costs and stock levels.
 */
export async function GET() {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.studioCustomer?.isDealer !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await loadWizardBootstrap();
  return NextResponse.json(toDealerWizardBootstrap(data));
}
