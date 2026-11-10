import { NextRequest, NextResponse } from "next/server";
import { IDNO_RE, requireSuperAdmin } from "@/lib/settlements/guard";
import { actorOf } from "@/lib/settlements/audit";
import { runSupplierAutoMatch } from "@/lib/settlements/supplierMatchLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Supplier auto-match. `{ idno }` = one supplier; without it all suppliers in
 * IDNO order from `cursor`, stopping after ~40 s. Repeat with `nextCursor`
 * while `remaining > 0`. Creates `suggested` links; auto-confirms only cited
 * number + exact amount or a unique exact amount in the window.
 */
export async function POST(request: NextRequest) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const idno = typeof body.idno === "string" ? body.idno.trim() : null;
  const cursor = typeof body.cursor === "string" ? body.cursor.trim() : null;
  if (idno && !IDNO_RE.test(idno)) return NextResponse.json({ error: "invalid_idno" }, { status: 400 });
  if (cursor && !IDNO_RE.test(cursor)) return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  try {
    const result = await runSupplierAutoMatch({ idno, cursor, budgetMs: 40_000, actor: actorOf(g.user) });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/settlements/supplier-match/auto:", error);
    return NextResponse.json({ error: "Supplier auto-match failed" }, { status: 500 });
  }
}
