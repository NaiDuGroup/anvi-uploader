import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import InvoiceDetailClient from "../../../_components/InvoiceDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminInvoiceDetailPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  const { id } = await params;

  return <InvoiceDetailClient invoiceId={id} currentUserRole={user.role} />;
}
