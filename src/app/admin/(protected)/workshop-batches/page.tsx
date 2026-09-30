import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import WorkshopBatchesClient from "../../_components/WorkshopBatchesClient";

export const dynamic = "force-dynamic";

/**
 * Standalone tools page for workshop operators: the notebook and pen batch
 * layout composers plus a shared 7-day history. Deliberately gated the same
 * way as `/admin/workshop-board` — studio `admin` accounts must not see
 * production floor tooling.
 */
export default async function WorkshopBatchesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  const allowed = ["workshop", "superadmin"];
  if (!allowed.includes(user.role)) redirect("/admin/orders");

  return <WorkshopBatchesClient />;
}
