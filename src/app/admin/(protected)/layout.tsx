import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
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

  const profile = await getOrCreateCompanyProfile();
  const companyLogoSrc = resolveCompanyLogoImgSrc(profile.logoPath);

  return (
    <AdminAppShell
      user={{ name: user.name, displayName: user.displayName, role: user.role }}
      companyLogoSrc={companyLogoSrc}
    >
      {children}
    </AdminAppShell>
  );
}
