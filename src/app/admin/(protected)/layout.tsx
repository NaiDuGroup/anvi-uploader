import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminAppShell from "../_components/AdminAppShell";

export default async function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/admin/login");
  }

  return (
    <AdminAppShell user={{ name: user.name, role: user.role }}>
      {children}
    </AdminAppShell>
  );
}
