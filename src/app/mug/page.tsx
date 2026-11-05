import { TurnstileScope } from "@/components/turnstile/TurnstileScope";
import { getOrCreateCompanyProfile, getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import { toOrderContactInfo } from "@/lib/studioInfo/orderContact";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";
import MugPageClient from "./MugPageClient";

export const dynamic = "force-dynamic";

export default async function MugPage() {
  const [showPublicCabinetLoginCta, profile] = await Promise.all([
    getShowPublicCabinetLoginCta(),
    getOrCreateCompanyProfile(),
  ]);
  return (
    <>
      <MugPageClient
        showPublicCabinetLoginCta={showPublicCabinetLoginCta}
        contactInfo={toOrderContactInfo(resolveStudioInfo(profile.studioInfo))}
      />
      <TurnstileScope action="upload" />
    </>
  );
}
