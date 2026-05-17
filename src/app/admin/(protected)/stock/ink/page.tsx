import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import InkStockPageClient from "./InkStockPageClient";

export default async function InkStockPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  return <InkStockPageClient />;
}
