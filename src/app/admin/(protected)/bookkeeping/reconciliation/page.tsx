import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import ReconciliationPageClient from "../../../_components/ReconciliationPageClient";

export default async function AdminBookkeepingReconciliationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  return <ReconciliationPageClient />;
}
