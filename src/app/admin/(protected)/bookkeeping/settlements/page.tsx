import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import SettlementsPageClient from "../../../_components/SettlementsPageClient";

export default async function AdminBookkeepingSettlementsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 sm:py-6">
      <SettlementsPageClient />
    </main>
  );
}
