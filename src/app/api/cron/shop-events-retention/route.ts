import { NextRequest, NextResponse } from "next/server";
import { CORPORATE_IP_RETENTION_MONTHS } from "@/lib/corporate/retention";
import { eraseOldCorporateRequestIps } from "@/lib/corporate/retentionJob";
import { SHOP_EVENTS_RETENTION_DAYS } from "@/lib/shop/analytics/events";
import { pruneShopEvents } from "@/lib/shop/analytics/ingest";

/**
 * Daily storefront privacy retention (privacy policy «Cât timp păstrăm datele»):
 * delete funnel events older than 180 days («Statistică anonimă») and erase
 * the IP / user agent of «Pentru companii» requests older than 12 months.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  try {
    const deleted = await pruneShopEvents(now);
    const corporateIpsErased = await eraseOldCorporateRequestIps(now);
    return NextResponse.json({
      ok: true,
      deleted,
      retentionDays: SHOP_EVENTS_RETENTION_DAYS,
      corporateIpsErased,
      corporateIpRetentionMonths: CORPORATE_IP_RETENTION_MONTHS,
    });
  } catch (error) {
    console.error("[shop-events-retention] failed:", error);
    return NextResponse.json({ error: "Retention failed" }, { status: 500 });
  }
}

/** Vercel Cron invokes routes with GET; POST stays for manual runs. */
export { POST as GET };
