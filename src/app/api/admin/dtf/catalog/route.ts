import { NextResponse } from "next/server";
import { loadDtfCatalog } from "@/lib/dtf/dtfCatalog";
import { DtfAccess, dtfRouteError, requireDtfUser } from "@/lib/dtf/dtfRoute";

export async function GET() {
  const user = await requireDtfUser(DtfAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json(await loadDtfCatalog());
  } catch (error) {
    return dtfRouteError(error, "catalog");
  }
}
