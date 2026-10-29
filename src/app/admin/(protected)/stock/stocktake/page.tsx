import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import StocktakePageClient from "./StocktakePageClient";

export const dynamic = "force-dynamic";

export default async function StocktakePage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  const { category } = await searchParams;
  return <StocktakePageClient initialCategory={category?.trim() || null} />;
}
