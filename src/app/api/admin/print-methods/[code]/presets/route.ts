import { NextRequest, NextResponse } from "next/server";
import { printPresetSchema } from "@/lib/printMethods/presets";
import { printMethodHasPriceList } from "@/lib/printMethods/methods";
import { createPrintPreset } from "@/lib/printMethods/printMethodsDb";
import {
  PrintMethodAccess,
  printMethodCodeOr404,
  printMethodRouteError,
  readJsonBody,
  requirePrintMethodUser,
} from "@/lib/printMethods/printMethodRoute";

type Params = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await requirePrintMethodUser(PrintMethodAccess.Manage);
  if (user instanceof NextResponse) return user;
  const code = printMethodCodeOr404((await params).code);
  if (code instanceof NextResponse) return code;
  // Sublimation is priced per blank: it has no format price list.
  if (!printMethodHasPriceList(code)) {
    return NextResponse.json({ error: "print_method_no_price_list" }, { status: 404 });
  }
  try {
    const input = printPresetSchema.parse(await readJsonBody(request));
    const created = await createPrintPreset(code, input);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return printMethodRouteError(error, "preset create");
  }
}
