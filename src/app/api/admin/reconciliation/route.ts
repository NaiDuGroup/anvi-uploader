import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { computeBalanceReport } from "@/lib/reconciliation/report";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const report = await computeBalanceReport();
    return NextResponse.json(report);
  } catch (error) {
    console.error("GET /api/admin/reconciliation:", error);
    return NextResponse.json(
      { error: "Failed to build balance report" },
      { status: 500 },
    );
  }
}
