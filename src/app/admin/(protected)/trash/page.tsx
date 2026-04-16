import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import TrashPageClient from "../../_components/TrashPageClient";

export const dynamic = "force-dynamic";

export default async function AdminTrashPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  return <TrashPageClient />;
}
