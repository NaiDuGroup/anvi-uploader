import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isWorkshopOnly } from "@/lib/roles";
import { loadWizardBootstrap } from "@/lib/wizardBootstrap";
import NewOrderPageClient from "../../new/NewOrderPageClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEditOrderPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  if (isWorkshopOnly(user.role)) {
    redirect("/admin/orders");
  }

  const [{ id }, bootstrap] = await Promise.all([params, loadWizardBootstrap()]);

  return (
    <NewOrderPageClient
      staffRole={user.role}
      initialProduct={null}
      initialMode={null}
      editOrderId={id}
      bootstrap={bootstrap}
    />
  );
}
