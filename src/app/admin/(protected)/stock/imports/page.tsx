import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManagePurchases } from "@/lib/roles";
import ImportsPageClient from "./ImportsPageClient";

export default async function ImportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManagePurchases(user.role)) redirect("/admin/stock");
  return <ImportsPageClient />;
}
