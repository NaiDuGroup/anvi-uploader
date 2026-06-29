import { Suspense } from "react";
import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import LoginPanel from "@/components/LoginPanel";

export default async function CabinetLoginPage() {
  const profile = await getOrCreateCompanyProfile();
  const companyLogoSrc = resolveCompanyLogoImgSrc(profile.logoPath);
  return (
    <Suspense fallback={null}>
      <LoginPanel defaultMode="client" companyLogoSrc={companyLogoSrc} />
    </Suspense>
  );
}
