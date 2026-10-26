import { NextResponse } from "next/server";
import { dtfRouteError } from "@/lib/dtf/dtfRoute";
import { isPrintMethodCode, type PrintMethodCode } from "@/lib/printMethods/methods";
import { PrintMethodNotFoundError } from "@/lib/printMethods/printMethodsDb";

export { DtfAccess as PrintMethodAccess, readJsonBody, requireDtfUser as requirePrintMethodUser } from "@/lib/dtf/dtfRoute";

/** `[code]` route segment → method code, or the 404 response to return. */
export function printMethodCodeOr404(code: string): PrintMethodCode | NextResponse {
  return isPrintMethodCode(code) ? code : NextResponse.json({ error: "print_method_not_found" }, { status: 404 });
}

/** Error mapping for `/api/admin/print-methods/**` (DTF mapping + missing method/preset → 404). */
export function printMethodRouteError(error: unknown, label: string): NextResponse {
  if (error instanceof PrintMethodNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return dtfRouteError(error, `print-methods ${label}`);
}
