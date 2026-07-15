import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { computeClientStatement } from "@/lib/reconciliation/report";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ idno: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { idno } = await params;
  try {
    const statement = await computeClientStatement(idno);
    if (!statement) {
      return NextResponse.json({ error: "No fiscal invoices for buyer" }, { status: 404 });
    }
    return NextResponse.json({ statement });
  } catch (error) {
    console.error("GET /api/admin/reconciliation/act/[idno]:", error);
    return NextResponse.json(
      { error: "Failed to build reconciliation act" },
      { status: 500 },
    );
  }
}
