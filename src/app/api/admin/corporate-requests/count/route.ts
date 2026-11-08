import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { countNewCorporateRequests } from "@/lib/corporate/requests";

/** New (untaken) «Pentru companii» requests for the admin nav badge. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 });
  try {
    return NextResponse.json({ new: await countNewCorporateRequests() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/admin/corporate-requests/count:", error);
    return NextResponse.json({ new: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}
