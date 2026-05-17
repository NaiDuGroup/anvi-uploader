import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile, getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import HomePageClient from "./HomePageClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [showPublicCabinetLoginCta, profile] = await Promise.all([
    getShowPublicCabinetLoginCta(),
    getOrCreateCompanyProfile(),
  ]);
  const companyLogoSrc = resolveCompanyLogoImgSrc(profile.logoPath);
  return (
    <HomePageClient
      showPublicCabinetLoginCta={showPublicCabinetLoginCta}
      companyLogoSrc={companyLogoSrc}
    />
  );
}
