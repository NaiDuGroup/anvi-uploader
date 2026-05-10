import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  getOrCreateCompanyProfile,
  toSerializableCompanyProfile,
} from "@/lib/invoice/companyProfile";
import NewInvoicePageClient from "../../../_components/NewInvoicePageClient";

interface PageProps {
  searchParams: Promise<{ clientId?: string }>;
}

export default async function NewInvoicePage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  const profile = await getOrCreateCompanyProfile();
  const sp = await searchParams;
  return (
    <NewInvoicePageClient
      companyProfile={toSerializableCompanyProfile(profile)}
      initialClientId={sp.clientId ?? null}
    />
  );
}
