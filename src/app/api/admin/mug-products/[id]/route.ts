import { NextRequest, NextResponse } from "next/server";
import { MUG_HANDLE_STYLES, MUG_SHAPE_LIMITS } from "@/lib/mug/mugShape";
import { MUG_FINISHES, MUG_GRADIENT_HEIGHT_MAX, MUG_GRADIENT_HEIGHT_MIN } from "@/lib/mug/mugSurface";
import { printMethodsSchema } from "@/lib/stock/unified/printMethods";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
  adminCatalogPatchPrismaResponse,
  prismaKnownErrorDebugPayload,
} from "@/lib/adminCatalogPrismaErrors";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminMugProductJson } from "@/lib/mug/toAdminMugProductJson";
import { normalizeMugCatalogPatchBody } from "@/lib/mug/mugCatalogHexNormalize";
import { DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import {
  loadMugVariantForAdmin,
  updateMugCatalogItem,
} from "@/lib/mug/mugCatalogWrite";
import { resolveMugVariantId } from "@/lib/mug/mugVariant";
import { checkCatalogProductHardDelete } from "@/lib/stock/canHardDeleteCatalogProduct";
import { mdlPriceSchema } from "@/lib/validations";

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

const shapeCm = z.number().min(MUG_SHAPE_LIMITS.minCm).max(MUG_SHAPE_LIMITS.maxCm);

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
  bodyColorHex: hex.optional(),
  handleColorHex: hex.optional(),
  innerColorHex: hex.nullable().optional(),
  rimColorHex: hex.nullable().optional(),
  printWidthCm: printCm.optional(),
  printHeightCm: printCm.optional(),
  printDpi: printDpi.optional(),
  has3dPreview: z.boolean().optional(),
  finish: z.enum(MUG_FINISHES).optional(),
  gradientColorHex: hex.nullable().optional(),
  gradientHeightPct: z.number().min(MUG_GRADIENT_HEIGHT_MIN).max(MUG_GRADIENT_HEIGHT_MAX).optional(),
  bodyHeightCm: shapeCm.optional(),
  topDiameterCm: shapeCm.optional(),
  bottomDiameterCm: shapeCm.optional(),
  handleStyle: z.enum(MUG_HANDLE_STYLES).optional(),
  printMethods: printMethodsSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
});

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;

  try {
    // Old links may still carry a legacy mug id.
    const id: string | null = await resolveMugVariantId(prisma, rawId);
    const existing = id ? await loadMugVariantForAdmin(prisma, id) : null;
    if (!id || !existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const guard = await checkCatalogProductHardDelete(id);
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

    // The item owns its single variant (cascade).
    await prisma.stockItem.delete({ where: { id: existing.itemId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/admin/mug-products/[id]:", e);
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
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = patchBody.parse(normalizeMugCatalogPatchBody(raw));

    const variantId: string | null = await resolveMugVariantId(prisma, id);
    const existing = variantId ? await loadMugVariantForAdmin(prisma, variantId) : null;
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction((tx) =>
      updateMugCatalogItem(tx, existing, body, user.id),
    );

    return NextResponse.json({ item: toAdminMugProductJson(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    const prismaHandled = adminCatalogPatchPrismaResponse(e);
    if (prismaHandled) return prismaHandled;

    console.error("PATCH /api/admin/mug-products/[id]:", e);
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
