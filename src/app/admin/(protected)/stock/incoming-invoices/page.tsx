import { redirect } from "next/navigation";

/** Moved to Bookkeeping → Purchases. */
export default function LegacyIncomingInvoicesPage() {
  redirect("/admin/bookkeeping/purchases");
}
