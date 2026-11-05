import { TurnstileScope } from "@/components/turnstile/TurnstileScope";
import PenPageClient from "./PenPageClient";
import { getOrCreateCompanyProfile, getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import { toOrderContactInfo } from "@/lib/studioInfo/orderContact";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

export default async function PenPage() {
  const [showPublicCabinetLoginCta, profile] = await Promise.all([
    getShowPublicCabinetLoginCta(),
    getOrCreateCompanyProfile(),
  ]);
  return (
    <>
      <PenPageClient
        showPublicCabinetLoginCta={showPublicCabinetLoginCta}
        contactInfo={toOrderContactInfo(resolveStudioInfo(profile.studioInfo))}
      />
      <TurnstileScope action="upload" />
    </>
  );
}
