import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import PrintersPageClient from "./PrintersPageClient";

export const dynamic = "force-dynamic";

export default async function StockPrintersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  return <PrintersPageClient />;
}
