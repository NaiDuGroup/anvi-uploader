import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import StockPricesPageClient from "./StockPricesPageClient";

export const dynamic = "force-dynamic";

export default async function StockPricesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  const { category } = await searchParams;
  return <StockPricesPageClient initialCategory={category?.trim() || null} />;
}
