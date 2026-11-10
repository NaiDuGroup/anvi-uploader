import { NextRequest, NextResponse } from "next/server";
import { IDNO_RE, requireSuperAdmin } from "@/lib/settlements/guard";
import { loadSupplierCard } from "@/lib/settlements/supplierMatchLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Supplier invoices with payment status, payments with links and open suggestions for one IDNO. */
export async function GET(request: NextRequest) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  const idno = request.nextUrl.searchParams.get("idno")?.trim() ?? "";
  if (!IDNO_RE.test(idno)) return NextResponse.json({ error: "invalid_idno" }, { status: 400 });
  try {
    return NextResponse.json(await loadSupplierCard(idno));
  } catch (error) {
    console.error("GET /api/admin/settlements/supplier-match:", error);
    return NextResponse.json({ error: "Failed to load supplier matches" }, { status: 500 });
  }
}
