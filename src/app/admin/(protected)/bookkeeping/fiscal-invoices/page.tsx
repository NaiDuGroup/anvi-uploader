import { redirect } from "next/navigation";

/** Legacy path — sales (outgoing e-Factura) lives at /bookkeeping/sales. */
export default function AdminBookkeepingFiscalInvoicesPage() {
  redirect("/admin/bookkeeping/sales");
}
