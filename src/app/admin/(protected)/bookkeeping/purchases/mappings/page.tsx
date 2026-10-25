import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import SupplierMappingsPageClient from "./SupplierMappingsPageClient";

export default async function SupplierMappingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  return <SupplierMappingsPageClient />;
}
