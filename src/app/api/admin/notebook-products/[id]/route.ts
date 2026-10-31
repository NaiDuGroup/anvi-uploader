import { uvPrintNormsSchema } from "@/lib/uv/uvPrintNorms";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
  adminCatalogPatchPrismaResponse,
  prismaKnownErrorDebugPayload,
} from "@/lib/adminCatalogPrismaErrors";
import { getSessionUser } from "@/lib/auth";
import { canManageNotebookCatalog } from "@/lib/roles";
import { toAdminNotebookProductJson } from "@/lib/notebook/toAdminNotebookProductJson";
import { normalizeNotebookCatalogPatchBody } from "@/lib/notebook/notebookCatalogHexNormalize";
import { DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import { notebookPaperKindZod } from "@/lib/notebook/notebookPaperKind";
import {
  loadNotebookVariantForAdmin,
  updateNotebookCatalogItem,
} from "@/lib/notebook/notebookCatalogWrite";
import { resolveNotebookVariantId } from "@/lib/notebook/notebookVariant";
import { checkCatalogProductHardDelete } from "@/lib/stock/canHardDeleteCatalogProduct";
import { mdlPriceSchema } from "@/lib/validations";
import { notebookLookPartialSchema } from "@/lib/notebook/notebookLook";

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
  uvPrintNorms: uvPrintNormsSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
}).extend(notebookLookPartialSchema.shape);

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManageNotebookCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;

  try {
    // Old links may still carry a legacy notebook id.
    const id: string | null = await resolveNotebookVariantId(prisma, rawId);
    const existing = id ? await loadNotebookVariantForAdmin(prisma, id) : null;
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

    const variantId: string | null = await resolveNotebookVariantId(prisma, id);
    const existing = variantId ? await loadNotebookVariantForAdmin(prisma, variantId) : null;
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction((tx) =>
      updateNotebookCatalogItem(tx, existing, body, user.id),
    );

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
