import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import SettlementCardClient from "../../../../_components/SettlementCardClient";

export default async function AdminSettlementCardPage({
  params,
}: {
  params: Promise<{ idno: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isSuperAdmin(user.role)) redirect("/admin/orders");
  const { idno } = await params;
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 sm:py-6">
      <SettlementCardClient idno={decodeURIComponent(idno).trim()} />
    </main>
  );
}
