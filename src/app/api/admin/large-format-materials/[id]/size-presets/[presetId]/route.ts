import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toLfSizePresetJson } from "@/lib/largeFormat/toLfSizePresetJson";

const patchBody = z.object({
  widthCm: z.number().int().min(1).max(10_000).optional(),
  heightCm: z.number().int().min(1).max(10_000).optional(),
  retailPriceMdl: z.number().int().min(0).max(99_999_999).optional(),
  dealerPriceMdl: z.number().int().min(0).max(99_999_999).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

function prismaErrorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; presetId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, presetId } = await params;

  try {
    const existing = await prisma.lfMaterialSizePreset.findUnique({
      where: { id: presetId },
      select: { id: true, materialId: true },
    });
    if (!existing || existing.materialId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = patchBody.parse(await request.json());

    const updated = await prisma.lfMaterialSizePreset.update({
      where: { id: presetId },
      data: {
        ...(body.widthCm !== undefined ? { widthCm: body.widthCm } : {}),
        ...(body.heightCm !== undefined ? { heightCm: body.heightCm } : {}),
        ...(body.retailPriceMdl !== undefined ? { retailPriceMdl: body.retailPriceMdl } : {}),
        ...(body.dealerPriceMdl !== undefined ? { dealerPriceMdl: body.dealerPriceMdl } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    return NextResponse.json({ item: toLfSizePresetJson(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    if (prismaErrorCode(e) === "P2002") {
      return NextResponse.json(
        { error: "duplicate_size", hint: "A preset with this width × height already exists." },
        { status: 409 },
      );
    }
    console.error("PATCH /api/admin/large-format-materials/[id]/size-presets/[presetId]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; presetId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, presetId } = await params;

  try {
    const existing = await prisma.lfMaterialSizePreset.findUnique({
      where: { id: presetId },
      select: { id: true, materialId: true },
    });
    if (!existing || existing.materialId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.lfMaterialSizePreset.delete({ where: { id: presetId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/admin/large-format-materials/[id]/size-presets/[presetId]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
