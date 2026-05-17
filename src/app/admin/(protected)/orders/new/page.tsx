import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isWorkshopOnly } from "@/lib/roles";
import NewOrderPageClient from "./NewOrderPageClient";

export const dynamic = "force-dynamic";

interface SearchParams {
  product?: string;
  mode?: string;
  /**
   * When set, the order POST will attach the new order to this invoice line
   * (V1 of the bidirectional invoice ↔ order link). The page just forwards
   * the value through; auth + ownership are re-checked server-side.
   */
  fromInvoiceLineItemId?: string;
  /** Optional pre-selected client id for invoice-driven flows. */
  clientId?: string;
}

export default async function AdminNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  // Workshop-only roles do not see "+ New Order" anywhere; defend the route too.
  if (isWorkshopOnly(user.role)) {
    redirect("/admin/orders");
  }

  const params = await searchParams;
  return (
    <NewOrderPageClient
      staffRole={user.role}
      initialProduct={params.product ?? null}
      initialMode={params.mode ?? null}
      fromInvoiceLineItemId={params.fromInvoiceLineItemId ?? null}
      initialClientId={params.clientId ?? null}
    />
  );
}
