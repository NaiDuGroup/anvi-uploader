import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import ClientCardPageClient from "../../../_components/ClientCardPageClient";

export default async function AdminClientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  const { id } = await params;
  return <ClientCardPageClient clientId={id} />;
}
