import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageNotebookCatalog } from "@/lib/roles";
import NotebookCatalogPageClient from "./NotebookCatalogPageClient";

export default async function NotebookCatalogPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canManageNotebookCatalog(user.role)) redirect("/admin/orders");
  return <NotebookCatalogPageClient />;
}
