import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/settlements/guard";
import { actorOf } from "@/lib/settlements/audit";
import { undoSupplierAllocation } from "@/lib/settlements/supplierMatchLoad";

export const runtime = "nodejs";

/** Undo a confirmed supplier link (or forget a rejection). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  const { id } = await params;
  try {
    const ok = await undoSupplierAllocation(id, actorOf(g.user));
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/settlements/supplier-match/[id]:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
