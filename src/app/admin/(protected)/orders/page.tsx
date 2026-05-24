import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminPageClient from "../../_components/AdminPageClient";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  return (
    <AdminPageClient
      currentUser={{ id: user.id, name: user.name, role: user.role }}
    />
  );
}
