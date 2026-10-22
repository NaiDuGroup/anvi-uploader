import { NextRequest, NextResponse } from "next/server";
import { syncPurchaseInvoices } from "@/lib/purchasing/syncPurchaseInvoices";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Incoming supplier invoices (we are the buyer): import new e-Factura invoices
 * and auto-post lines covered by trusted supplier mappings. Vercel Cron calls GET.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncPurchaseInvoices();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("e-Factura purchase sync failed:", error);
    return NextResponse.json({ error: "purchase_sync_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
