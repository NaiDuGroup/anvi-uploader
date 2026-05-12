import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  getOrCreateCompanyProfile,
  getShowPublicCabinetLoginCta,
  toSerializableCompanyProfile,
} from "@/lib/invoice/companyProfile";
import SettingsPageClient from "../../_components/SettingsPageClient";

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");

  const profile = await getOrCreateCompanyProfile();
  const serialized = toSerializableCompanyProfile(profile);
  serialized.showPublicCabinetLoginCta = await getShowPublicCabinetLoginCta();
  return <SettingsPageClient initialProfile={serialized} />;
}
