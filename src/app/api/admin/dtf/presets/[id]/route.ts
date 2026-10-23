import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { dtfPresetSchema } from "@/lib/dtf/dtfAdminSchemas";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    const input = dtfPresetSchema.partial().parse(await readJsonBody(request));
    await prisma.dtfPrintPreset.update({
      where: { id },
      data: {
        label: input.label,
        widthCm: input.widthCm == null ? undefined : new Prisma.Decimal(input.widthCm),
        heightCm: input.heightCm == null ? undefined : new Prisma.Decimal(input.heightCm),
        retailPrice:
          input.retailPrice == null ? undefined : new Prisma.Decimal(input.retailPrice.toFixed(2)),
        dealerPrice:
          input.dealerPrice === undefined
            ? undefined
            : input.dealerPrice === null
              ? null
              : new Prisma.Decimal(input.dealerPrice.toFixed(2)),
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dtfRouteError(error, "preset update");
  }
}

/** Orders keep their own snapshot of the preset, so removal is safe. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const { id } = await params;
    await prisma.dtfPrintPreset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dtfRouteError(error, "preset delete");
  }
}
