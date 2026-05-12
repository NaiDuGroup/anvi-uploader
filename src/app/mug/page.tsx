import { getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import MugPageClient from "./MugPageClient";

export const dynamic = "force-dynamic";

export default async function MugPage() {
  const showPublicCabinetLoginCta = await getShowPublicCabinetLoginCta();
  return <MugPageClient showPublicCabinetLoginCta={showPublicCabinetLoginCta} />;
}
