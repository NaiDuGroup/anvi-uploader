import { NextRequest, NextResponse } from "next/server";
import {
  syncFiscalInvoices,
  enrichFiscalInvoiceDetails,
} from "@/lib/efactura/sync";
import { runAutoMatch } from "@/lib/reconciliation/autoMatch";
import { isEFacturaLive } from "@/lib/efactura";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Max enrich chunks per cron run (~50 invoices × delay ≈ stays under 300s). */
const ENRICH_CHUNKS = 6;
const ENRICH_LIMIT = 50;

/**
 * Daily e-Factura sync (Vercel cron): discover identities (Accepted + Search
 * Sent/Completed + Archive), drain a large slice of missing XML details, then
 * auto-match bank payments. Idempotent; leftover enrich work resumes next day.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isEFacturaLive()) {
      return NextResponse.json({ ok: true, skipped: "efactura_mock" });
    }

    const sync = await syncFiscalInvoices();

    const enrichRuns: Array<{
      processed: number;
      settledFound: number;
      remaining: number;
    }> = [];
    for (let i = 0; i < ENRICH_CHUNKS; i++) {
      const enrich = await enrichFiscalInvoiceDetails({ limit: ENRICH_LIMIT });
      enrichRuns.push({
        processed: enrich.processed,
        settledFound: enrich.settledFound,
        remaining: enrich.remaining,
      });
      if (enrich.remaining <= 0 || enrich.processed === 0) break;
    }

    const match = await runAutoMatch({ autoApply: true });
    const enrichProcessed = enrichRuns.reduce((n, r) => n + r.processed, 0);
    const enrichRemaining =
      enrichRuns.length > 0
        ? enrichRuns[enrichRuns.length - 1]!.remaining
        : 0;

    return NextResponse.json({
      ok: true,
      sync,
      enrich: { chunks: enrichRuns.length, processed: enrichProcessed, remaining: enrichRemaining },
      match,
    });
  } catch (error) {
    console.error("e-Factura sync failed:", error);
    return NextResponse.json(
      { error: "e-Factura sync failed" },
      { status: 500 },
    );
  }
}
