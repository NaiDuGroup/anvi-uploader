import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import IncomingInvoiceDetailClient from "./IncomingInvoiceDetailClient";

export default async function IncomingInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  const { id } = await params;
  return <IncomingInvoiceDetailClient invoiceId={id} />;
}
