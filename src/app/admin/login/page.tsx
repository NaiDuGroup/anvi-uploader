import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import AdminLoginPageClient from "../_components/AdminLoginPageClient";

export default async function AdminLoginPage() {
  const profile = await getOrCreateCompanyProfile();
  const companyLogoSrc = resolveCompanyLogoImgSrc(profile.logoPath);
  return <AdminLoginPageClient companyLogoSrc={companyLogoSrc} />;
}
