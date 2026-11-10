import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { computeSettlementsReport } from "@/lib/settlements/load";

export const runtime = "nodejs";

/** «Взаиморасчёты»: signed balance per fiscal code across sales and purchases. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json(await computeSettlementsReport());
  } catch (error) {
    console.error("GET /api/admin/settlements:", error);
    return NextResponse.json({ error: "Failed to build settlements" }, { status: 500 });
  }
}
