import { NextRequest, NextResponse } from "next/server";
import { parseIds, requireSuperAdmin } from "@/lib/settlements/guard";
import { actorOf } from "@/lib/settlements/audit";
import { rejectSupplierAllocations } from "@/lib/settlements/supplierMatchLoad";

export const runtime = "nodejs";

/** `{ ids: string[] }` of suggested supplier links. */
export async function POST(request: NextRequest) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  const ids = parseIds(await request.json().catch(() => null));
  if (!ids) return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
  try {
    return NextResponse.json(await rejectSupplierAllocations(ids, actorOf(g.user)));
  } catch (error) {
    console.error("POST /api/admin/settlements/supplier-match/reject:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
