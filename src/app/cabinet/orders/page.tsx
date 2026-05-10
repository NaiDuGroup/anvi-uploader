import { redirect } from "next/navigation";
import { getCustomerSessionUser } from "@/lib/auth";
import CabinetShell from "../_components/CabinetShell";
import OrdersListClient from "./OrdersListClient";

export default async function CabinetOrdersPage() {
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
      <OrdersListClient
        viewer={{
          displayName: user.displayName ?? user.name,
          isDealer: sc.isDealer,
        }}
      />
    </CabinetShell>
  );
}
