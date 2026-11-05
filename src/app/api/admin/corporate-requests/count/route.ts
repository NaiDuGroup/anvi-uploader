import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { countNewCorporateRequests } from "@/lib/corporate/requests";

/** New (untaken) «Pentru companii» requests for the admin nav badge. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ new: await countNewCorporateRequests() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/admin/corporate-requests/count:", error);
    return NextResponse.json({ new: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}
