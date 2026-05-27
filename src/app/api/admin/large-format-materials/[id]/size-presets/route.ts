import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toLfSizePresetJson } from "@/lib/largeFormat/toLfSizePresetJson";

const createBody = z.object({
  widthCm: z.number().int().min(1).max(10_000),
  heightCm: z.number().int().min(1).max(10_000),
  retailPriceMdl: z.number().int().min(0).max(99_999_999),
  dealerPriceMdl: z.number().int().min(0).max(99_999_999),
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const material = await prisma.largeFormatMaterial.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!material) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rows = await prisma.lfMaterialSizePreset.findMany({
      where: { materialId: id },
      orderBy: [{ sortOrder: "asc" }, { widthCm: "asc" }, { heightCm: "asc" }],
    });
    return NextResponse.json({ items: rows.map(toLfSizePresetJson) });
  } catch (e) {
    console.error("GET /api/admin/large-format-materials/[id]/size-presets:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const material = await prisma.largeFormatMaterial.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!material) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = createBody.parse(await request.json());

    const row = await prisma.lfMaterialSizePreset.create({
      data: {
        materialId: id,
        widthCm: body.widthCm,
        heightCm: body.heightCm,
        retailPriceMdl: body.retailPriceMdl,
        dealerPriceMdl: body.dealerPriceMdl,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({ item: toLfSizePresetJson(row) });
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
    console.error("POST /api/admin/large-format-materials/[id]/size-presets:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
