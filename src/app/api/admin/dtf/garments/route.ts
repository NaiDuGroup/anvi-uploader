import { NextRequest, NextResponse } from "next/server";
import { createGarmentSchema } from "@/lib/dtf/dtfAdminSchemas";
import { loadGarmentProducts } from "@/lib/dtf/dtfCatalog";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { createGarmentProduct } from "@/lib/dtf/garmentCatalogWrite";

export async function GET() {
  const user = await requireDtfUser(DtfAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ items: await loadGarmentProducts(false) });
  } catch (error) {
    return dtfRouteError(error, "garments list");
  }
}

export async function POST(request: NextRequest) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const input = createGarmentSchema.parse(await readJsonBody(request));
    const id: string = await createGarmentProduct(input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return dtfRouteError(error, "garment create");
  }
}
