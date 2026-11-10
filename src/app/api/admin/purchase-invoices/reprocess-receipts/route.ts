import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { reprocessPurchaseReceipts } from "@/lib/purchasing/reprocessReceipts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Super admin: parse stored supplier XMLs for B/f (fiscal receipt) references.
 * Body `{ maxRows?: number }`. Call repeatedly until `remaining` is 0.
 * Returns `{ processed, settledFound, remaining, withoutXml }`.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const maxRows = typeof body.maxRows === "number" && Number.isFinite(body.maxRows) ? body.maxRows : undefined;
  try {
    const result = await reprocessPurchaseReceipts({ maxRows });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/purchase-invoices/reprocess-receipts:", error);
    return NextResponse.json({ error: "Failed to reprocess receipts" }, { status: 500 });
  }
}
