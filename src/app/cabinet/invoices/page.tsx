import { redirect } from "next/navigation";
import { getCustomerSessionUser } from "@/lib/auth";
import CabinetShell from "../_components/CabinetShell";
import CabinetInvoicesListClient from "./CabinetInvoicesListClient";

export default async function CabinetInvoicesPage() {
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
      <CabinetInvoicesListClient />
    </CabinetShell>
  );
}
