import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import FiscalInvoicesPageClient from "../../../_components/FiscalInvoicesPageClient";

export default async function AdminBookkeepingSalesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 sm:py-6">
      <FiscalInvoicesPageClient />
    </main>
  );
}
