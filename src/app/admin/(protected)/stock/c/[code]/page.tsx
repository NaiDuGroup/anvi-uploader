import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { dedicatedCategoryPage } from "@/lib/stock/unified/dedicatedCategoryPages";
import StockCategoryPageClient from "./StockCategoryPageClient";

export const dynamic = "force-dynamic";

export default async function StockCategoryPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  const { code } = await params;
  const decoded: string = decodeURIComponent(code);
  // Pens and notebooks keep their own catalog screens.
  const dedicated: string | null = dedicatedCategoryPage(decoded);
  if (dedicated) redirect(dedicated);
  return <StockCategoryPageClient code={decoded} />;
}
