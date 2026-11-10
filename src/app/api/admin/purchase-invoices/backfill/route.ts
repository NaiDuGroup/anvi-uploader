import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { backfillPurchaseInvoices } from "@/lib/purchasing/backfillPurchaseInvoices";
import { PurchaseSyncFailure } from "@/lib/purchasing/dto";
import { classifySyncFailure, syncFailureDetail } from "@/lib/purchasing/syncFailure";

export const runtime = "nodejs";
export const maxDuration = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(raw: unknown): Date | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Super admin: import purchase invoice history for «Взаиморасчёты».
 * Body `{ from: "2023-01-01", to?: "2026-09-01", maxDetails?: number }`
 * (`to` is exclusive and clamped to the start of the normal 45-day sync
 * window). History is stored with totals only and stays out of the stock
 * review queue. Call repeatedly until `remainingDetails` is 0.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const from = parseDay(body.from);
  const to = body.to == null ? new Date() : parseDay(body.to);
  if (!from || !to || from >= to) {
    return NextResponse.json(
      { error: "invalid_range", hint: "from/to as YYYY-MM-DD, from < to" },
      { status: 400 },
    );
  }
  const maxDetails =
    typeof body.maxDetails === "number" && body.maxDetails >= 0
      ? Math.min(Math.floor(body.maxDetails), 1000)
      : undefined;

  try {
    return NextResponse.json(await backfillPurchaseInvoices({ from, to, maxDetails }));
  } catch (error) {
    console.error("purchase invoices backfill:", error);
    const reason = classifySyncFailure(error);
    return NextResponse.json(
      { error: "backfill_failed", reason, detail: syncFailureDetail(error) },
      { status: reason === PurchaseSyncFailure.DatabaseSchemaOutdated ? 503 : 502 },
    );
  }
}
