import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
} from "@/lib/invoice/invoiceSerialization";
import {
  getOrCreateCompanyProfile,
  toSerializableCompanyProfile,
} from "@/lib/invoice/companyProfile";
import InvoiceDetailClient from "../../../_components/InvoiceDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminInvoiceDetailPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) notFound();

  const profile = await getOrCreateCompanyProfile();

  return (
    <InvoiceDetailClient
      initialInvoice={toSerializableInvoice(invoice)}
      companyProfile={toSerializableCompanyProfile(profile)}
      currentUserRole={user.role}
    />
  );
}
