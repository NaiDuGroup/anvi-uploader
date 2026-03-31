import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { fetchOrdersData } from "@/lib/fetchOrders";
import type { FetchOrdersResult } from "@/lib/fetchOrders";
import AdminPageClient from "./_components/AdminPageClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  let initialData: FetchOrdersResult;
  try {
    initialData = await fetchOrdersData(user);
  } catch {
    initialData = {
      orders: [],
      page: 1,
      totalPages: 0,
      totalCount: 0,
      workshopOrders: [],
      currentUser: { id: user.id, name: user.name, role: user.role },
    };
  }

  return <AdminPageClient initialData={initialData} />;
}
