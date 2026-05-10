import { redirect } from "next/navigation";
import { getCustomerSessionUser } from "@/lib/auth";
import CabinetShell from "../_components/CabinetShell";
import ProfileClient from "./ProfileClient";

export default async function CabinetProfilePage() {
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
      <ProfileClient
        initial={{
          kind: sc.kind,
          phone: sc.phone ?? "",
          personName: sc.personName,
          companyName: sc.companyName,
          companyIdno: sc.companyIdno,
          companyIban: sc.companyIban,
          email: sc.email,
        }}
      />
    </CabinetShell>
  );
}
