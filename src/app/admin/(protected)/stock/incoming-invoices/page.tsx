import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManagePurchases } from "@/lib/roles";
import IncomingInvoicesPageClient from "./IncomingInvoicesPageClient";

export default async function IncomingInvoicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManagePurchases(user.role)) redirect("/admin/orders");
  return <IncomingInvoicesPageClient />;
}
