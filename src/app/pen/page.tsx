import PenPageClient from "./PenPageClient";
import { getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";

export const dynamic = "force-dynamic";

export default async function PenPage() {
  const showPublicCabinetLoginCta = await getShowPublicCabinetLoginCta();
  return <PenPageClient showPublicCabinetLoginCta={showPublicCabinetLoginCta} />;
}
