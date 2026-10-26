import { NextRequest, NextResponse } from "next/server";
import { printPresetPatchSchema } from "@/lib/printMethods/presets";
import { deletePrintPreset, updatePrintPreset } from "@/lib/printMethods/printMethodsDb";
import {
  PrintMethodAccess,
  printMethodCodeOr404,
  printMethodRouteError,
  readJsonBody,
  requirePrintMethodUser,
} from "@/lib/printMethods/printMethodRoute";

type Params = { params: Promise<{ code: string; id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await requirePrintMethodUser(PrintMethodAccess.Manage);
  if (user instanceof NextResponse) return user;
  const { code: rawCode, id } = await params;
  const code = printMethodCodeOr404(rawCode);
  if (code instanceof NextResponse) return code;
  try {
    const input = printPresetPatchSchema.parse(await readJsonBody(request));
    await updatePrintPreset(code, id, input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return printMethodRouteError(error, "preset update");
  }
}

/** Orders keep their own snapshot of the preset, so removal is safe. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await requirePrintMethodUser(PrintMethodAccess.Manage);
  if (user instanceof NextResponse) return user;
  const { code: rawCode, id } = await params;
  const code = printMethodCodeOr404(rawCode);
  if (code instanceof NextResponse) return code;
  try {
    await deletePrintPreset(code, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return printMethodRouteError(error, "preset delete");
  }
}
