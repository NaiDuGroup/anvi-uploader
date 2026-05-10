import { redirect } from "next/navigation";
import { getCustomerSessionUser } from "@/lib/auth";
import CabinetShell from "../../_components/CabinetShell";
import OrderDetailClient from "./OrderDetailClient";

export default async function CabinetOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCustomerSessionUser();
  if (!user) redirect("/cabinet/login");
  const sc = user.studioCustomer!;
  return (
    <CabinetShell
      user={{
        name: user.name,
        displayName: user.displayName,
        isDealer: sc.isDealer,
      }}
    >
      <OrderDetailClient orderId={id} />
    </CabinetShell>
  );
}
