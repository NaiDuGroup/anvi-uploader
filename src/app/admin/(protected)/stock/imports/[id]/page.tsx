import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageImports } from "@/lib/roles";
import ImportDetailClient from "./ImportDetailClient";

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageImports(user.role)) redirect("/admin/stock");
  const { id } = await params;
  return <ImportDetailClient id={id} />;
}
