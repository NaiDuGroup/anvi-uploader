import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import ClientsPageClient from "../../_components/ClientsPageClient";

export default async function AdminClientsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  return <ClientsPageClient currentUserRole={user.role} />;
}
