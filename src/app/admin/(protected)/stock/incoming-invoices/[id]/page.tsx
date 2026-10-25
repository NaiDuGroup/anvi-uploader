import { redirect } from "next/navigation";

/** Moved to Bookkeeping → Purchases. */
export default async function LegacyIncomingInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/bookkeeping/purchases/${encodeURIComponent(id)}`);
}
