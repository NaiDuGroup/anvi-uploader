import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import DesignEditorClient from "../_components/DesignEditorClient";

export default async function DesignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");
  const { id } = await params;
  return <DesignEditorClient designId={id} />;
}
