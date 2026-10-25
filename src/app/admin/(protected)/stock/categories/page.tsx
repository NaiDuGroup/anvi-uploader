import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import StockCategoriesPageClient from "./StockCategoriesPageClient";

export const dynamic = "force-dynamic";

export default async function StockCategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  return <StockCategoriesPageClient />;
}
