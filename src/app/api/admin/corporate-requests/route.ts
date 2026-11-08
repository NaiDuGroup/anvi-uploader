import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { listCorporateRequests } from "@/lib/corporate/requests";
import { isCorporateStatus } from "@/lib/corporate/requestRules";

const NO_STORE = { "Cache-Control": "no-store" };

/** Staff list of «Pentru companii» requests: `?status=new|…|open&q=&assignee=&page=`. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isSuperAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  try {
    const data = await listCorporateRequests({
      status: status === "open" || isCorporateStatus(status) ? status : null,
      q: sp.get("q"),
      assigneeId: sp.get("assignee"),
      page: Number(sp.get("page")) || 1,
    });
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/corporate-requests:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
