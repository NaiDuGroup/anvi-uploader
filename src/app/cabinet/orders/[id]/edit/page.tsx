import { redirect } from "next/navigation";
import { getCustomerSessionUser } from "@/lib/auth";
import CabinetShell from "../../../_components/CabinetShell";
import NewOrderPageClient from "@/app/admin/(protected)/orders/new/NewOrderPageClient";

export const dynamic = "force-dynamic";

/**
 * Dealer edit of an own order: the dealer order wizard in edit mode, prefilled
 * from `GET /api/cabinet/orders/[id]/edit` and saved with
 * `PUT /api/cabinet/orders/[id]`. Both refuse once printing started; the
 * wizard then shows the «already printing» message.
 */
export default async function CabinetEditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCustomerSessionUser();
  if (!user) redirect("/cabinet/login");
  const sc = user.studioCustomer!;
  if (!sc.isDealer) redirect(`/cabinet/orders/${id}`);

  return (
    <CabinetShell
      user={{
        name: user.name,
        displayName: user.displayName,
        isDealer: sc.isDealer,
      }}
    >
      <NewOrderPageClient
        audience="dealer"
        staffRole="dealer"
        initialProduct={null}
        initialMode={null}
        editOrderId={id}
      />
    </CabinetShell>
  );
}
