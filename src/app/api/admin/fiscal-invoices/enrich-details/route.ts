import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { isEFacturaLive } from "@/lib/efactura";
import {
  countReprocessableReceipts,
  enrichFiscalInvoiceDetails,
  reprocessStoredReceipts,
} from "@/lib/efactura/sync";
import { STATEMENT_EFACTURA_STATUSES } from "@/lib/reconciliation/autoMatch";

export const runtime = "nodejs";
// Enrichment is throttled (~0.4s/invoice) and processes a chunk per call, so
// allow a long-ish window for a batch of up to ~100 invoices.
export const maxDuration = 300;

/**
 * GET: progress only — how many invoices still need detail enrichment.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [fetchPending, total, reprocessable] = await Promise.all([
    prisma.fiscalInvoice.count({
      where: {
        detailsFetchedAt: null,
        eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES },
      },
    }),
    prisma.fiscalInvoice.count({
      where: { eFacturaStatus: { in: STATEMENT_EFACTURA_STATUSES } },
    }),
    countReprocessableReceipts(),
  ]);

  return NextResponse.json({
    live: isEFacturaLive(),
    remaining: fetchPending + reprocessable,
    total,
  });
}

/**
 * POST: enriches one bounded chunk of not-yet-fetched fiscal invoices from the
 * e-Factura XML, detecting "B/f" fiscal-receipt settlement. Idempotent and
 * safe to call repeatedly until `remaining` reaches 0.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isEFacturaLive()) {
    return NextResponse.json(
      { error: "e-Factura is not connected (mock mode)" },
      { status: 400 },
    );
  }

  let limit = 50;
  try {
    const body = await request.json();
    if (typeof body?.limit === "number" && body.limit > 0) {
      limit = Math.min(200, Math.floor(body.limit));
    }
  } catch {
    // no body -> default limit
  }

  try {
    // Cheap local pass first: interpret receipt markers in already-stored XML.
    const reprocessed = await reprocessStoredReceipts();
    const result = await enrichFiscalInvoiceDetails({ limit });
    return NextResponse.json({
      ok: true,
      ...result,
      settledFound: result.settledFound + reprocessed.settled,
      remaining: result.remaining + (await countReprocessableReceipts()),
    });
  } catch (error) {
    console.error("POST /api/admin/fiscal-invoices/enrich-details:", error);
    const message =
      error instanceof Error ? error.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
