import { uvPrintNormsSchema } from "@/lib/uv/uvPrintNorms";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManagePenCatalog } from "@/lib/roles";
import { toAdminPenProductJson } from "@/lib/pen/toAdminPenProductJson";
import { loadPenVariantForAdmin, updatePenCatalogItem } from "@/lib/pen/penCatalogWrite";
import { resolvePenVariantId } from "@/lib/pen/penVariant";
import { DPI_PRESETS, PEN_PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import { checkCatalogProductHardDelete } from "@/lib/stock/canHardDeleteCatalogProduct";
import { mdlPriceSchema } from "@/lib/validations";
import {
  ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
  adminCatalogPatchPrismaResponse,
  prismaKnownErrorDebugPayload,
} from "@/lib/adminCatalogPrismaErrors";

function prismaErrorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const printCm = z
  .number()
  .min(PEN_PRINT_DIMENSION_LIMITS.minCm)
  .max(PEN_PRINT_DIMENSION_LIMITS.maxCm);
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
  sellPrice: mdlPriceSchema.nullable().optional(),
  dealerPrice: mdlPriceSchema.nullable().optional(),
  purchaseCost: mdlPriceSchema.nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  bodyColorHex: hex.optional(),
  clipColorHex: hex.optional(),
  printWidthCm: printCm.optional(),
  printHeightCm: printCm.optional(),
  printDpi: printDpi.optional(),
  has3dPreview: z.boolean().optional(),
  uvPrintNorms: uvPrintNormsSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManagePenCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;

  try {
    // Old links may still carry a legacy pen id.
    const id: string | null = await resolvePenVariantId(prisma, rawId);
    const product = id ? await loadPenVariantForAdmin(prisma, id) : null;

    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ product: toAdminPenProductJson(product) });
  } catch (e) {
    console.error("GET /api/admin/pen-products/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManagePenCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;

  try {
    const id: string | null = await resolvePenVariantId(prisma, rawId);
    const existing = id ? await loadPenVariantForAdmin(prisma, id) : null;
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
    console.error("DELETE /api/admin/pen-products/[id]:", e);
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
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManagePenCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = patchBody.parse(raw);

    const variantId: string | null = await resolvePenVariantId(prisma, id);
    const existing = variantId ? await loadPenVariantForAdmin(prisma, variantId) : null;
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction((tx) =>
      updatePenCatalogItem(tx, existing, body, user.id),
    );

    return NextResponse.json({ product: toAdminPenProductJson(updated) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: e.issues }, { status: 400 });
    }
    const prismaHandled = adminCatalogPatchPrismaResponse(e);
    if (prismaHandled) return prismaHandled;

    console.error("PATCH /api/admin/pen-products/[id]:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
