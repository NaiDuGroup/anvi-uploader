import { redirect } from "next/navigation";
import { getCustomerSessionUser } from "@/lib/auth";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import CabinetShell from "../../_components/CabinetShell";
import CabinetNewOrderClient, {
  type CabinetViewer,
} from "./CabinetNewOrderClient";
import NewOrderPageClient from "@/app/admin/(protected)/orders/new/NewOrderPageClient";

function computeInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default async function CabinetNewOrderPage() {
  const user = await getCustomerSessionUser();
  if (!user) redirect("/cabinet/login");
  const sc = user.studioCustomer!;

  const contact = orderContactFromStudioCustomer({
    kind: sc.kind,
    phone: sc.phone,
    personName: sc.personName,
    companyName: sc.companyName,
  });

  const displayName =
    user.displayName?.trim() ||
    contact.clientName?.trim() ||
    user.name?.trim() ||
    "—";

  const viewer: CabinetViewer = {
    displayName,
    phone: contact.phone || "—",
    isDealer: sc.isDealer,
    initials: computeInitials(displayName),
  };

  return (
    <CabinetShell
      user={{
        name: user.name,
        displayName: user.displayName,
        isDealer: sc.isDealer,
      }}
    >
      {sc.isDealer ? (
        // Dealers get the workshop's order wizard (dealer prices, no costs).
        <NewOrderPageClient
          audience="dealer"
          staffRole="dealer"
          initialProduct={null}
          initialMode={null}
        />
      ) : (
        <CabinetNewOrderClient viewer={viewer} />
      )}
    </CabinetShell>
  );
}
