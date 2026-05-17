import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import LargeFormatMaterialsPageClient from "./LargeFormatMaterialsPageClient";

export default async function LargeFormatMaterialsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  return <LargeFormatMaterialsPageClient />;
}
