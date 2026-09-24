import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { catalogPrintCmDecimal } from "@/lib/catalogPrintDecimal";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminPenProductJson } from "@/lib/pen/toAdminPenProductJson";
import { DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import { checkCatalogProductHardDelete } from "@/lib/stock/canHardDeleteCatalogProduct";
import { mdlPriceSchema } from "@/lib/validations";
import {
  ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
  adminCatalogPatchPrismaResponse,
  prismaKnownErrorDebugPayload,
} from "@/lib/adminCatalogPrismaErrors";

function toCatalogPriceDecimal(
  value: number | null | undefined,
): Prisma.Decimal | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Prisma.Decimal(value.toFixed(2));
}

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
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
});

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
    const product = await prisma.penProduct.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true, displayName: true } } },
    });

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
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.penProduct.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const guard = await checkCatalogProductHardDelete("pen", id);
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

    await prisma.penProduct.delete({ where: { id } });
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
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = patchBody.parse(raw);

    const existing = await prisma.penProduct.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Prisma.PenProductUpdateInput = {};
    if (body.sku !== undefined) updates.sku = body.sku.trim();
    if (body.nameRo !== undefined) updates.nameRo = body.nameRo.trim();
    if (body.nameRu !== undefined) updates.nameRu = body.nameRu.trim();
    if (body.nameEn !== undefined) updates.nameEn = body.nameEn.trim();
    if (body.stockQuantity !== undefined) updates.stockQuantity = body.stockQuantity;
    if (body.sellPrice !== undefined)
      updates.sellPrice = toCatalogPriceDecimal(body.sellPrice);
    if (body.dealerPrice !== undefined)
      updates.dealerPrice = toCatalogPriceDecimal(body.dealerPrice);
    if (body.purchaseCost !== undefined)
      updates.purchaseCost = toCatalogPriceDecimal(body.purchaseCost);
    if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl?.trim() || null;
    if (body.bodyColorHex !== undefined) updates.bodyColorHex = body.bodyColorHex;
    if (body.clipColorHex !== undefined) updates.clipColorHex = body.clipColorHex;
    if (body.printWidthCm !== undefined)
      updates.printWidthCm = catalogPrintCmDecimal(body.printWidthCm);
    if (body.printHeightCm !== undefined)
      updates.printHeightCm = catalogPrintCmDecimal(body.printHeightCm);
    if (body.printDpi !== undefined) updates.printDpi = body.printDpi;
    if (body.has3dPreview !== undefined) updates.has3dPreview = body.has3dPreview;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.internalNotes !== undefined)
      updates.internalNotes = body.internalNotes?.trim() || null;

    const updated = await prisma.penProduct.update({
      where: { id },
      data: updates,
      include: { createdBy: { select: { name: true, displayName: true } } },
    });

    return NextResponse.json({ product: toAdminPenProductJson(updated) });
  } catch (e) {
    console.error("PATCH /api/admin/pen-products/[id]:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: e.errors }, { status: 400 });
    }
    return adminCatalogPatchPrismaResponse(e);
  }
}
