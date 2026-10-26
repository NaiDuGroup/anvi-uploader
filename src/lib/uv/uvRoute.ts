import { NextResponse } from "next/server";
import { dtfRouteError } from "@/lib/dtf/dtfRoute";
import { UvLineError } from "@/lib/uv/uvLineCalc";

export { DtfAccess as UvAccess, readJsonBody, requireDtfUser as requireUvUser } from "@/lib/dtf/dtfRoute";

/** Error mapping for `/api/admin/uv/**`: UV pricing errors → 400 with their code, the rest as DTF routes. */
export function uvRouteError(error: unknown, label: string): NextResponse {
  if (error instanceof UvLineError) {
    return NextResponse.json({ error: error.code }, { status: 400 });
  }
  return dtfRouteError(error, `uv ${label}`);
}
