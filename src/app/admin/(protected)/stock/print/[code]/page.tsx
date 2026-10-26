import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isPrintMethodCode } from "@/lib/printMethods/methods";
import { canManageMugCatalog } from "@/lib/roles";
import PrintMethodPageClient from "./PrintMethodPageClient";

type Props = { params: Promise<{ code: string }> };

/** «DTF / UV: прайс и нормы»: one page for every print method with a format price list. */
export default async function PrintMethodPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageMugCatalog(user.role)) redirect("/admin/orders");
  const { code } = await params;
  if (!isPrintMethodCode(code)) notFound();
  return <PrintMethodPageClient code={code} />;
}
