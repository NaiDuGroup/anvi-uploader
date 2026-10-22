import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canManagePurchases } from "@/lib/roles";
import { InvoiceListFilter, listPurchaseInvoices } from "@/lib/purchasing/purchaseQueries";
import { syncPurchaseInvoices } from "@/lib/purchasing/syncPurchaseInvoices";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Incoming supplier invoices (open by default; `?filter=all` for history). */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManagePurchases(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const filter: InvoiceListFilter =
    request.nextUrl.searchParams.get("filter") === InvoiceListFilter.All
      ? InvoiceListFilter.All
      : InvoiceListFilter.Open;
  try {
    return NextResponse.json(await listPurchaseInvoices(filter));
  } catch (error) {
    console.error("purchase invoices list:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/** «Check now»: pull new invoices from e-Factura and auto-post trusted lines. */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !canManagePurchases(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json(await syncPurchaseInvoices());
  } catch (error) {
    console.error("purchase invoices sync:", error);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
