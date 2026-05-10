import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import InvoicesPageClient from "../../_components/InvoicesPageClient";

export default async function AdminInvoicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");
  return <InvoicesPageClient />;
}
