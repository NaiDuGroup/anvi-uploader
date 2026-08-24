import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import DesignLibraryClient from "./_components/DesignLibraryClient";

export default async function DesignStudioPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");
  return <DesignLibraryClient />;
}
