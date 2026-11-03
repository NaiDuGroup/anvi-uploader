import type { ReactNode } from "react";
import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";
import CabinetShellClient, { type CabinetShellUser } from "./CabinetShellClient";

export type { CabinetShellUser };

/**
 * Server wrapper for the cabinet shell: resolves the company logo (same
 * source as the admin header / login page — superadmin company profile)
 * and the public studio card for the footer, and hands them to the client shell.
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
  // Only public fields go to the browser — no counters, VAT or signatures.
  const footer = {
    studio: resolveStudioInfo(profile.studioInfo),
    payment: {
      name: profile.name,
      fiscalCode: profile.fiscalCode,
      iban: profile.iban,
      bankName: profile.bankName,
      bic: profile.bic,
    },
  };
  return (
    <CabinetShellClient user={user} companyLogoSrc={companyLogoSrc} footer={footer}>
      {children}
    </CabinetShellClient>
  );
}
