import { NextRequest, NextResponse } from "next/server";
import { loadPrintMethod, loadPrintPresets, savePrintMethodSettings } from "@/lib/printMethods/printMethodsDb";
import {
  PrintMethodAccess,
  printMethodCodeOr404,
  printMethodRouteError,
  readJsonBody,
  requirePrintMethodUser,
} from "@/lib/printMethods/printMethodRoute";

type Params = { params: Promise<{ code: string }> };

/** The method (names, printer, parsed settings) and its whole price list. */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await requirePrintMethodUser(PrintMethodAccess.Read);
  if (user instanceof NextResponse) return user;
  const code = printMethodCodeOr404((await params).code);
  if (code instanceof NextResponse) return code;
  try {
    const [method, presets] = await Promise.all([loadPrintMethod(code), loadPrintPresets(code, false)]);
    if (!method) return NextResponse.json({ error: "print_method_not_found" }, { status: 404 });
    return NextResponse.json({ method, presets });
  } catch (error) {
    return printMethodRouteError(error, "read");
  }
}

/** Settings patch: any subset of the method's keys, merged onto the stored settings. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await requirePrintMethodUser(PrintMethodAccess.Manage);
  if (user instanceof NextResponse) return user;
  const code = printMethodCodeOr404((await params).code);
  if (code instanceof NextResponse) return code;
  try {
    const settings = await savePrintMethodSettings(code, await readJsonBody(request));
    return NextResponse.json({ settings });
  } catch (error) {
    return printMethodRouteError(error, "settings update");
  }
}
