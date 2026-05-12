import { getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import HomePageClient from "./HomePageClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const showPublicCabinetLoginCta = await getShowPublicCabinetLoginCta();
  return <HomePageClient showPublicCabinetLoginCta={showPublicCabinetLoginCta} />;
}
