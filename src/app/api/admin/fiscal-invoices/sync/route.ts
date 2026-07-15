import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  runPostIngestEnrichment,
  syncFiscalInvoices,
} from "@/lib/efactura/sync";
import { isEFacturaLive } from "@/lib/efactura";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Manual e-Factura pull triggered from the admin UI. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncFiscalInvoices();
    // Larger chunk after Search discover — amounts come from XML enrich.
    const enrichment = await runPostIngestEnrichment({ enrichLimit: 80 });
    return NextResponse.json({ live: isEFacturaLive(), result, enrichment });
  } catch (error) {
    console.error("POST /api/admin/fiscal-invoices/sync:", error);
    const message =
      error instanceof Error ? error.message : "e-Factura sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
