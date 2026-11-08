import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewShopAdmin } from "@/lib/shop/report/access";
import ShopAdminLayoutClient from "./ShopAdminLayoutClient";

/** «Сайт» section (report, promo codes, company requests): super admin only. */
export default async function ShopAdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!canViewShopAdmin(user.role)) redirect("/admin/orders");
  return <ShopAdminLayoutClient>{children}</ShopAdminLayoutClient>;
}
