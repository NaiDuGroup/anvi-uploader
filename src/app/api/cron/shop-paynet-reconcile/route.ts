import { NextRequest, NextResponse } from "next/server";
import { paynetConfig } from "@/lib/shop/paynet";
import { pendingPaynetOrderIds, syncPaynetOrderById, type PaynetSyncResult } from "@/lib/shop/paynetSettle";

/** Orders this old or newer are re-checked (Paynet links live ≤ PAYNET_EXPIRY_MINUTES, notifications may be lost). */
const LOOKBACK_DAYS = 3;

/**
 * Reconcile Paynet payments: every pending / failed Paynet storefront order
 * of the last 3 days is re-checked with Paynet and settled when paid (covers
 * a lost notification and a customer who closed the tab before returning).
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!paynetConfig()) return NextResponse.json({ ok: true, skipped: "not_configured" });
  try {
    const ids = await pendingPaynetOrderIds(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
    const counts: Partial<Record<PaynetSyncResult | "error", number>> = {};
    for (const id of ids) {
      let r: PaynetSyncResult | "error";
      try {
        r = await syncPaynetOrderById(id);
      } catch (e) {
        console.error(`[shop-paynet-reconcile] order ${id} failed:`, e);
        r = "error";
      }
      counts[r] = (counts[r] ?? 0) + 1;
    }
    return NextResponse.json({ ok: true, checked: ids.length, ...counts });
  } catch (error) {
    console.error("[shop-paynet-reconcile] failed:", error);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}

/** Vercel Cron invokes routes with GET; POST stays for manual runs. */
export { POST as GET };
