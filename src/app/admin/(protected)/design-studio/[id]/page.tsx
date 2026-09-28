import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import DesignEditorClient from "../_components/DesignEditorClient";

export default async function DesignEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ toOrder?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");
  const { id } = await params;
  const { toOrder } = await searchParams;
  return <DesignEditorClient designId={id} toOrder={toOrder === "1"} />;
}
