import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog, canManageImports } from "@/lib/roles";
import StockHubPageClient from "./StockHubPageClient";

export default async function StockHubPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  return <StockHubPageClient canManageImports={canManageImports(user.role)} />;
}
