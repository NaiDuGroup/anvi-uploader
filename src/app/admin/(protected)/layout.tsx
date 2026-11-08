import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";
import { activeAnnouncementIds, pendingAnnouncementIds } from "@/lib/announcements";
import AdminAppShell from "../_components/AdminAppShell";
import { AnnouncementsProvider } from "../_components/announcements/AnnouncementsProvider";

export default async function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getOrCreateCompanyProfile(),
  ]);
  if (!user) {
    redirect("/admin/login");
  }
  const companyLogoSrc = resolveCompanyLogoImgSrc(profile.logoPath);
  // «Что нового»: computed here so the modal / hints render without a flash.
  const now = new Date();
  const seen = user.seenAnnouncements ?? [];
  const announcements = {
    seen,
    activeIds: activeAnnouncementIds(user.role, now),
    pendingIds: pendingAnnouncementIds(user.role, seen, now),
  };

  return (
    <AnnouncementsProvider role={user.role} initial={announcements}>
      <AdminAppShell
        user={{ name: user.name, displayName: user.displayName, role: user.role }}
        companyLogoSrc={companyLogoSrc}
        studioPhone={resolveStudioInfo(profile.studioInfo).mainPhone}
      >
        {children}
      </AdminAppShell>
    </AnnouncementsProvider>
  );
}
