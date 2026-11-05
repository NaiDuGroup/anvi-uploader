import { TurnstileScope } from "@/components/turnstile/TurnstileScope";
import { getOrCreateCompanyProfile, getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import { toOrderContactInfo } from "@/lib/studioInfo/orderContact";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";
import NotebookPageClient from "./NotebookPageClient";

export const dynamic = "force-dynamic";

export default async function NotebookPage() {
  const [showPublicCabinetLoginCta, profile] = await Promise.all([
    getShowPublicCabinetLoginCta(),
    getOrCreateCompanyProfile(),
  ]);
  return (
    <>
      <NotebookPageClient
        showPublicCabinetLoginCta={showPublicCabinetLoginCta}
        contactInfo={toOrderContactInfo(resolveStudioInfo(profile.studioInfo))}
      />
      <TurnstileScope action="upload" />
    </>
  );
}
