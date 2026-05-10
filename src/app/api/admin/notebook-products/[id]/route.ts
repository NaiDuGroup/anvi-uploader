import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageNotebookCatalog } from "@/lib/roles";
import { toAdminNotebookProductJson } from "@/lib/notebook/toAdminNotebookProductJson";
import { normalizeNotebookCatalogPatchBody } from "@/lib/notebook/notebookCatalogHexNormalize";
import { DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import { notebookPaperKindZod } from "@/lib/notebook/notebookPaperKind";

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const printCm = z
  .number()
  .min(PRINT_DIMENSION_LIMITS.minCm)
  .max(PRINT_DIMENSION_LIMITS.maxCm);
const printDpi = z.number().int().refine(
  (v): v is (typeof DPI_PRESETS)[number] =>
    (DPI_PRESETS as readonly number[]).includes(v),
  { message: `printDpi must be one of ${DPI_PRESETS.join(", ")}` },
);

const patchBody = z.object({
  sku: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).optional(),
  nameRo: z.string().min(1).max(200).optional(),
  nameRu: z.string().min(1).max(200).optional(),
  nameEn: z.string().min(1).max(200).optional(),
  stockQuantity: z.number().int().min(0).max(999_999).optional(),
  sellPrice: z.number().int().min(0).max(99_999_999).nullable().optional(),
  dealerPrice: z.number().int().min(0).max(99_999_999).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  coverColorHex: hex.optional(),
  strapColorHex: hex.optional(),
  bookmarkColorHex: hex.optional(),
  paperKind: notebookPaperKindZod.optional(),
  printWidthCm: printCm.optional(),
  printHeightCm: printCm.optional(),
  printDpi: printDpi.optional(),
  has3dPreview: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageNotebookCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = patchBody.parse(normalizeNotebookCatalogPatchBody(raw));

    const existing = await prisma.notebookProduct.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.notebookProduct.update({
      where: { id },
      data: {
        ...(body.sku !== undefined ? { sku: body.sku.trim().toUpperCase() } : {}),
        ...(body.nameRo !== undefined ? { nameRo: body.nameRo.trim() } : {}),
        ...(body.nameRu !== undefined ? { nameRu: body.nameRu.trim() } : {}),
        ...(body.nameEn !== undefined ? { nameEn: body.nameEn.trim() } : {}),
        ...(body.stockQuantity !== undefined ? { stockQuantity: body.stockQuantity } : {}),
        ...(body.sellPrice !== undefined ? { sellPrice: body.sellPrice } : {}),
        ...(body.dealerPrice !== undefined ? { dealerPrice: body.dealerPrice } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl?.trim() || null } : {}),
        ...(body.coverColorHex !== undefined ? { coverColorHex: body.coverColorHex } : {}),
        ...(body.strapColorHex !== undefined ? { strapColorHex: body.strapColorHex } : {}),
        ...(body.bookmarkColorHex !== undefined ? { bookmarkColorHex: body.bookmarkColorHex } : {}),
        ...(body.paperKind !== undefined ? { paperKind: body.paperKind } : {}),
        ...(body.printWidthCm !== undefined ? { printWidthCm: body.printWidthCm } : {}),
        ...(body.printHeightCm !== undefined ? { printHeightCm: body.printHeightCm } : {}),
        ...(body.printDpi !== undefined ? { printDpi: body.printDpi } : {}),
        ...(body.has3dPreview !== undefined ? { has3dPreview: body.has3dPreview } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.internalNotes !== undefined
          ? { internalNotes: body.internalNotes?.trim() || null }
          : {}),
      },
    });

    return NextResponse.json({ item: toAdminNotebookProductJson(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "sku_taken" }, { status: 409 });
    }
    console.error("PATCH /api/admin/notebook-products/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
