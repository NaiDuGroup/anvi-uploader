import { getShowPublicCabinetLoginCta } from "@/lib/invoice/companyProfile";
import NotebookPageClient from "./NotebookPageClient";

export const dynamic = "force-dynamic";

export default async function NotebookPage() {
  const showPublicCabinetLoginCta = await getShowPublicCabinetLoginCta();
  return (
    <NotebookPageClient showPublicCabinetLoginCta={showPublicCabinetLoginCta} />
  );
}
