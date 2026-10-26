import { NextResponse } from "next/server";
import { loadSublimationCatalog } from "@/lib/sublimation/sublimationCatalog";
import { requireSublimationUser, SublimationAccess, sublimationRouteError } from "@/lib/sublimation/sublimationRoute";

export async function GET() {
  const user = await requireSublimationUser(SublimationAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await loadSublimationCatalog());
  } catch (error) {
    return sublimationRouteError(error, "catalog");
  }
}
