import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import DesignAssetsClient from "../_components/DesignAssetsClient";

export default async function DesignAssetsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");
  return <DesignAssetsClient />;
}
