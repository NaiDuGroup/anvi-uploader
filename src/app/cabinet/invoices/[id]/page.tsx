import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import CabinetShell from "../../_components/CabinetShell";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
} from "@/lib/invoice/invoiceSerialization";
import {
  getOrCreateCompanyProfile,
  toSerializableCompanyProfile,
} from "@/lib/invoice/companyProfile";
import CabinetInvoiceDetailClient from "./CabinetInvoiceDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CabinetInvoiceDetailPage({ params }: PageProps) {
  const user = await getCustomerSessionUser();
  if (!user) redirect("/cabinet/login");
  const sc = user.studioCustomer!;

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) notFound();
  // Defence-in-depth — the API also enforces this.
  if (invoice.clientId !== sc.id || invoice.status === "DRAFT") {
    redirect("/cabinet/invoices");
  }
  const profile = await getOrCreateCompanyProfile();

  return (
    <CabinetShell
      user={{
        name: user.name,
        displayName: user.displayName,
        isDealer: sc.isDealer,
      }}
    >
      <CabinetInvoiceDetailClient
        initialInvoice={toSerializableInvoice(invoice)}
        companyProfile={toSerializableCompanyProfile(profile)}
      />
    </CabinetShell>
  );
}
