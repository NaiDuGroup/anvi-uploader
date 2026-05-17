import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import AccountingPageClient from "../../_components/AccountingPageClient";

export const dynamic = "force-dynamic";

export default async function AdminAccountingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");

  return <AccountingPageClient />;
}
