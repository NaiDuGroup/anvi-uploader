import { TurnstileScope } from "@/components/turnstile/TurnstileScope";
import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile, getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import { redirect } from "next/navigation";
import { getCustomerSessionUser } from "@/lib/auth";
import { toOrderContactInfo } from "@/lib/studioInfo/orderContact";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";
import HomePageClient from "./HomePageClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Logged-in customers order from their cabinet (more products, dealer wizard).
  if (await getCustomerSessionUser()) redirect("/cabinet/orders/new");

  const [showPublicCabinetLoginCta, profile] = await Promise.all([
    getShowPublicCabinetLoginCta(),
    getOrCreateCompanyProfile(),
  ]);
  const companyLogoSrc = resolveCompanyLogoImgSrc(profile.logoPath);
  return (
    <>
      <HomePageClient
        showPublicCabinetLoginCta={showPublicCabinetLoginCta}
        companyLogoSrc={companyLogoSrc}
        contactInfo={toOrderContactInfo(resolveStudioInfo(profile.studioInfo))}
      />
      <TurnstileScope action="upload" />
    </>
  );
}
