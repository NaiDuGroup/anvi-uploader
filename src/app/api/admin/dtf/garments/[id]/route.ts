import { NextRequest, NextResponse } from "next/server";
import { updateGarmentSchema } from "@/lib/dtf/dtfAdminSchemas";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { GarmentSizeInUseError, updateGarmentProduct } from "@/lib/dtf/garmentCatalogWrite";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    const input = updateGarmentSchema.parse(await readJsonBody(request));
    await updateGarmentProduct(id, input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GarmentSizeInUseError) {
      return NextResponse.json({ error: error.code, size: error.size }, { status: 409 });
    }
    return dtfRouteError(error, "garment update");
  }
}
