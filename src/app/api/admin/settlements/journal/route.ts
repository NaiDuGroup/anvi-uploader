import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/settlements/guard";
import { isAuditAction, listAudit } from "@/lib/settlements/audit";

export const runtime = "nodejs";

/** «Журнал»: newest first; `?idno=&action=&user=(name|auto)&page=&pageSize=`. */
export async function GET(request: NextRequest) {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  const q = request.nextUrl.searchParams;
  const idno = q.get("idno")?.trim().slice(0, 64) || null;
  const actionRaw = q.get("action")?.trim() || null;
  const action = actionRaw && isAuditAction(actionRaw) ? actionRaw : null;
  const user = q.get("user")?.trim().slice(0, 200) || null;
  const page = Number(q.get("page") ?? "1");
  const pageSize = Number(q.get("pageSize") ?? "50");
  try {
    return NextResponse.json(
      await listAudit({
        idno,
        action,
        user,
        page: Number.isFinite(page) ? Math.floor(page) : 1,
        pageSize: Number.isFinite(pageSize) ? Math.floor(pageSize) : 50,
      }),
    );
  } catch (error) {
    console.error("GET /api/admin/settlements/journal:", error);
    return NextResponse.json({ error: "Failed to load journal" }, { status: 500 });
  }
}
