import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import ClientsPageClient from "../../_components/ClientsPageClient";

export default async function AdminClientsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin/orders");

  return <ClientsPageClient />;
}
