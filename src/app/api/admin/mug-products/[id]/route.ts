import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminMugProductJson } from "@/lib/mug/toAdminMugProductJson";
import { normalizeMugCatalogPatchBody } from "@/lib/mug/mugCatalogHexNormalize";
import { DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";

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

function prismaErrorDebugPayload(e: unknown): {
  prismaCode?: string;
  prismaMessage?: string;
  prismaMeta?: unknown;
} {
  if (typeof e !== "object" || e === null) return {};
  const o = e as { code?: unknown; message?: unknown; meta?: unknown };
  return {
    prismaCode: typeof o.code === "string" ? o.code : undefined,
    prismaMessage: typeof o.message === "string" ? o.message : undefined,
    prismaMeta: o.meta,
  };
}

const SCHEMA_DRIFT_HINT =
  "Stop the dev server, run `npm run db:prepare` from the project root (needs PostgreSQL + valid DATABASE_URL), then `npm run dev` again. If it still fails, run `npx prisma migrate status` and compare with `prisma/migrations`.";

const patchBody = z.object({
  sku: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).optional(),
  nameRo: z.string().min(1).max(200).optional(),
  nameRu: z.string().min(1).max(200).optional(),
  nameEn: z.string().min(1).max(200).optional(),
  stockQuantity: z.number().int().min(0).max(999_999).optional(),
  sellPrice: z.number().int().min(0).max(99_999_999).nullable().optional(),
  dealerPrice: z.number().int().min(0).max(99_999_999).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  bodyColorHex: hex.optional(),
  handleColorHex: hex.optional(),
  innerColorHex: hex.nullable().optional(),
  rimColorHex: hex.nullable().optional(),
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
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = patchBody.parse(normalizeMugCatalogPatchBody(raw));

    const existing = await prisma.mugProduct.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.mugProduct.update({
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
        ...(body.bodyColorHex !== undefined ? { bodyColorHex: body.bodyColorHex } : {}),
        ...(body.handleColorHex !== undefined ? { handleColorHex: body.handleColorHex } : {}),
        ...(body.innerColorHex !== undefined ? { innerColorHex: body.innerColorHex } : {}),
        ...(body.rimColorHex !== undefined ? { rimColorHex: body.rimColorHex } : {}),
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

    return NextResponse.json({
      item: toAdminMugProductJson(updated),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.flatten() }, { status: 400 });
    }
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "sku_taken" }, { status: 409 });
    }
    const code = prismaErrorCode(e);
    console.error("PATCH /api/admin/mug-products/[id]:", e);
    if (code === "P2022" || code === "P2021") {
      const debug =
        process.env.NODE_ENV === "development" ? prismaErrorDebugPayload(e) : {};
      return NextResponse.json(
        {
          error: "database_schema_outdated",
          hint: SCHEMA_DRIFT_HINT,
          ...debug,
        },
        { status: 503 },
      );
    }
    if (e instanceof Error && e.message.includes("Prisma client is outdated")) {
      return NextResponse.json(
        {
          error: "prisma_client_stale",
          hint: "Run `npx prisma generate`, then restart the dev server.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
