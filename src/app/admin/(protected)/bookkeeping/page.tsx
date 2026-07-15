import { redirect } from "next/navigation";

export default function AdminBookkeepingPage() {
  redirect("/admin/bookkeeping/reconciliation");
}
