import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import SuppliersPageClient from "../../../_components/SuppliersPageClient";

export default async function AdminBookkeepingPurchasesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 sm:py-6">
      <SuppliersPageClient />
    </main>
  );
}
