import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageLibrary, isAdmin } from "@/lib/roles";
import LibraryPageClient from "./LibraryPageClient";

export const dynamic = "force-dynamic";

export default async function AdminLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");
  const { item } = await searchParams;
  return <LibraryPageClient focusItemId={item ?? null} canManage={canManageLibrary(user.role)} />;
}
