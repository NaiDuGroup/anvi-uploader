import { redirect } from "next/navigation";

/** Old request link (Telegram alerts sent before the move): forward into «Сайт». */
export default async function LegacyCorporateRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/shop/corporate-requests/${encodeURIComponent(id)}`);
}
