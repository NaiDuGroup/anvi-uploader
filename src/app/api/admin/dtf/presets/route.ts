import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { dtfPresetSchema } from "@/lib/dtf/dtfAdminSchemas";
import { loadDtfPresets } from "@/lib/dtf/dtfCatalog";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireDtfUser(DtfAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ items: await loadDtfPresets(false) });
  } catch (error) {
    return dtfRouteError(error, "presets list");
  }
}

export async function POST(request: NextRequest) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const input = dtfPresetSchema.parse(await readJsonBody(request));
    const created = await prisma.dtfPrintPreset.create({
      data: {
        label: input.label,
        widthCm: new Prisma.Decimal(input.widthCm),
        heightCm: new Prisma.Decimal(input.heightCm),
        retailPrice: new Prisma.Decimal(input.retailPrice.toFixed(2)),
        dealerPrice:
          input.dealerPrice == null ? null : new Prisma.Decimal(input.dealerPrice.toFixed(2)),
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return dtfRouteError(error, "preset create");
  }
}
