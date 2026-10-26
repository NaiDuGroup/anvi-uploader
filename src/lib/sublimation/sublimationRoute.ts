import { NextResponse } from "next/server";
import { dtfRouteError } from "@/lib/dtf/dtfRoute";
import { SublimationLineError } from "@/lib/sublimation/sublimationLineCalc";

export {
  DtfAccess as SublimationAccess,
  readJsonBody,
  requireDtfUser as requireSublimationUser,
} from "@/lib/dtf/dtfRoute";

/** Error mapping for `/api/admin/sublimation/**`: pricing errors → 400 with their code, the rest as DTF routes. */
export function sublimationRouteError(error: unknown, label: string): NextResponse {
  if (error instanceof SublimationLineError) {
    return NextResponse.json({ error: error.code }, { status: 400 });
  }
  return dtfRouteError(error, `sublimation ${label}`);
}
