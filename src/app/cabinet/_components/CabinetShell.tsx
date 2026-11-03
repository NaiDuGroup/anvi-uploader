import type { ReactNode } from "react";
import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import CabinetShellClient, { type CabinetShellUser } from "./CabinetShellClient";

export type { CabinetShellUser };

/**
 * Server wrapper for the cabinet shell: resolves the company logo (same
 * source as the admin header / login page — superadmin company profile)
 * and hands it to the client shell.
 */
export default async function CabinetShell({
  user,
  children,
}: {
  user: CabinetShellUser;
  children: ReactNode;
}) {
  const profile = await getOrCreateCompanyProfile();
  const companyLogoSrc = resolveCompanyLogoImgSrc(profile.logoPath);
  return (
    <CabinetShellClient user={user} companyLogoSrc={companyLogoSrc}>
      {children}
    </CabinetShellClient>
  );
}
