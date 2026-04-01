import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CatalogPageClient from "./_components/CatalogPageClient";

export default async function CatalogPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin");

  return <CatalogPageClient />;
}
