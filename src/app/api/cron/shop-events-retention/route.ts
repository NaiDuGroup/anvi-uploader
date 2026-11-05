import { NextRequest, NextResponse } from "next/server";
import { SHOP_EVENTS_RETENTION_DAYS } from "@/lib/shop/analytics/events";
import { pruneShopEvents } from "@/lib/shop/analytics/ingest";

/** Daily: delete storefront funnel events older than 180 days (privacy policy, «Statistică anonimă»). */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const deleted = await pruneShopEvents(new Date());
    return NextResponse.json({ ok: true, deleted, retentionDays: SHOP_EVENTS_RETENTION_DAYS });
  } catch (error) {
    console.error("[shop-events-retention] failed:", error);
    return NextResponse.json({ error: "Retention failed" }, { status: 500 });
  }
}

/** Vercel Cron invokes routes with GET; POST stays for manual runs. */
export { POST as GET };
