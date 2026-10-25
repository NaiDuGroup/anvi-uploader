import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import SuppliersPageClient from "../../../../_components/SuppliersPageClient";

export default async function AdminBookkeepingSupplierPaymentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-5">
      <SuppliersPageClient />
    </main>
  );
}
