import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/settlements/guard";
import { loadSettlementsWithChecks } from "@/lib/settlements/checksLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

/** «Взаиморасчёты»: signed balance per fiscal code across sales and purchases + «Проверить» signals. */
export async function GET() {
  const g = await requireSuperAdmin();
  if ("response" in g) return g.response;
  try {
    return NextResponse.json(await loadSettlementsWithChecks());
  } catch (error) {
    console.error("GET /api/admin/settlements:", error);
    return NextResponse.json({ error: "Failed to build settlements" }, { status: 500 });
  }
}
