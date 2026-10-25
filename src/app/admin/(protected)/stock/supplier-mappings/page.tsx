import { redirect } from "next/navigation";

/** Moved to Bookkeeping → Purchases. */
export default function LegacySupplierMappingsPage() {
  redirect("/admin/bookkeeping/purchases/mappings");
}
