import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { getCorporateRequest, updateCorporateRequest } from "@/lib/corporate/requests";

const NO_STORE = { "Cache-Control": "no-store" };

/** One «Pentru companii» request (staff). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !isSuperAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const r = await getCorporateRequest(id);
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(r, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/corporate-requests/[id]:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Staff update: `{ status?, assigneeId?, notes? }`. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !isSuperAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const r = await updateCorporateRequest(id, raw);
    if (r.kind === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (r.kind === "invalid") return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    return NextResponse.json({ status: r.status, assigneeId: r.assigneeId, notes: r.notes }, { headers: NO_STORE });
  } catch (error) {
    console.error("PATCH /api/admin/corporate-requests/[id]:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
