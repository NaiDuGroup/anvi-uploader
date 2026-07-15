import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import BookkeepingLayoutClient from "../../_components/BookkeepingLayoutClient";

export default async function BookkeepingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");

  return <BookkeepingLayoutClient>{children}</BookkeepingLayoutClient>;
}
