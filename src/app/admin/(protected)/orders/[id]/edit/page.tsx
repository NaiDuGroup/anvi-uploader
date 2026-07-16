import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import NewOrderPageClient from "../../new/NewOrderPageClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditOrderPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  const { id } = await params;

  return (
    <NewOrderPageClient
      staffRole={user.role}
      initialProduct={null}
      initialMode={null}
      editOrderId={id}
    />
  );
}
