import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import AdminShell from "./_components/AdminShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    return <>{children}</>;
  }

  return (
    <AdminShell user={{ id: user.id, name: user.name, role: user.role }}>
      {children}
    </AdminShell>
  );
}
