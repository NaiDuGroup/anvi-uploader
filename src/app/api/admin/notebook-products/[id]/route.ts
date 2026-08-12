import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
  adminCatalogPatchPrismaResponse,
  prismaKnownErrorDebugPayload,
} from "@/lib/adminCatalogPrismaErrors";
import { getSessionUser } from "@/lib/auth";
import { catalogPrintCmDecimal } from "@/lib/catalogPrintDecimal";
import { canManageNotebookCatalog } from "@/lib/roles";
import { toAdminNotebookProductJson } from "@/lib/notebook/toAdminNotebookProductJson";
import { normalizeNotebookCatalogPatchBody } from "@/lib/notebook/notebookCatalogHexNormalize";
import { DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import { notebookPaperKindZod } from "@/lib/notebook/notebookPaperKind";
import { checkCatalogProductHardDelete } from "@/lib/stock/canHardDeleteCatalogProduct";
import { mdlPriceSchema } from "@/lib/validations";

/** Mirrors the same helper in the create route + mug catalog routes. */
function toCatalogPriceDecimal(
  value: number | null | undefined,
): Prisma.Decimal | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Prisma.Decimal(value.toFixed(2));
}

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

function prismaErrorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

const patchBody = z.object({
  sku: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).optional(),
  nameRo: z.string().min(1).max(200).optional(),
  nameRu: z.string().min(1).max(200).optional(),
  nameEn: z.string().min(1).max(200).optional(),
  stockQuantity: z.number().int().min(0).max(999_999).optional(),
  sellPrice: mdlPriceSchema.nullable().optional(),
  dealerPrice: mdlPriceSchema.nullable().optional(),
  purchaseCost: mdlPriceSchema.nullable().optional(),
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageNotebookCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.notebookProduct.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const guard = await checkCatalogProductHardDelete("notebook", id);
    if (!guard.ok) {
      return NextResponse.json(
        {
          error: "has_operations",
          movements: guard.movements,
          orderRefs: guard.orderRefs,
        },
        { status: 409 },
      );
    }

    await prisma.notebookProduct.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/admin/notebook-products/[id]:", e);
    const code = prismaErrorCode(e);
    if (code === "P2022" || code === "P2021") {
      const debug =
        process.env.NODE_ENV === "development" ? prismaKnownErrorDebugPayload(e) : {};
      return NextResponse.json(
        {
          error: "database_schema_outdated",
          hint: ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
          ...debug,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: "Internal error",
        ...(process.env.NODE_ENV === "development" && e instanceof Error
          ? { debugMessage: e.message }
          : {}),
      },
      { status: 500 },
    );
  }
}

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
        ...(body.sellPrice !== undefined
          ? { sellPrice: toCatalogPriceDecimal(body.sellPrice) }
          : {}),
        ...(body.dealerPrice !== undefined
          ? { dealerPrice: toCatalogPriceDecimal(body.dealerPrice) }
          : {}),
        ...(body.purchaseCost !== undefined
          ? { purchaseCost: toCatalogPriceDecimal(body.purchaseCost) }
          : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl?.trim() || null } : {}),
        ...(body.coverColorHex !== undefined ? { coverColorHex: body.coverColorHex } : {}),
        ...(body.strapColorHex !== undefined ? { strapColorHex: body.strapColorHex } : {}),
        ...(body.bookmarkColorHex !== undefined ? { bookmarkColorHex: body.bookmarkColorHex } : {}),
        ...(body.paperKind !== undefined ? { paperKind: body.paperKind } : {}),
        ...(body.printWidthCm !== undefined
          ? { printWidthCm: catalogPrintCmDecimal(body.printWidthCm) }
          : {}),
        ...(body.printHeightCm !== undefined
          ? { printHeightCm: catalogPrintCmDecimal(body.printHeightCm) }
          : {}),
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
    const prismaHandled = adminCatalogPatchPrismaResponse(e);
    if (prismaHandled) return prismaHandled;

    console.error("PATCH /api/admin/notebook-products/[id]:", e);
    const code = prismaErrorCode(e);
    if (code === "P2022" || code === "P2021") {
      const debug =
        process.env.NODE_ENV === "development" ? prismaKnownErrorDebugPayload(e) : {};
      return NextResponse.json(
        {
          error: "database_schema_outdated",
          hint: ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
          ...debug,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: "Internal error",
        ...(process.env.NODE_ENV === "development" && e instanceof Error
          ? { debugMessage: e.message }
          : {}),
      },
      { status: 500 },
    );
  }
}
