import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { loadSettlementLedger } from "@/lib/settlements/load";

export const runtime = "nodejs";

/** One counterparty's documents and payments on both sides, running balance. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ idno: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { idno: raw } = await params;
  const idno = decodeURIComponent(raw).trim();
  if (!idno || idno.length > 64) {
    return NextResponse.json({ error: "invalid_idno" }, { status: 400 });
  }
  try {
    const ledger = await loadSettlementLedger(idno);
    if (!ledger) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(ledger);
  } catch (error) {
    console.error("GET /api/admin/settlements/[idno]:", error);
    return NextResponse.json({ error: "Failed to load ledger" }, { status: 500 });
  }
}
