import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManagePenCatalog } from "@/lib/roles";
import PenCatalogPageClient from "./PenCatalogPageClient";

export const dynamic = "force-dynamic";

export default async function PenCatalogPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManagePenCatalog(user.role)) redirect("/admin/orders");
  return <PenCatalogPageClient />;
}
