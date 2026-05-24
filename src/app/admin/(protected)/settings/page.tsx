import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import SettingsPageClient from "../../_components/SettingsPageClient";

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");

  return <SettingsPageClient />;
}
