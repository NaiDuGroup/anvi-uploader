import { NextRequest, NextResponse } from "next/server";
import { MUG_HANDLE_STYLES, MUG_SHAPE_LIMITS } from "@/lib/mug/mugShape";
import { MUG_FINISHES, MUG_GRADIENT_HEIGHT_MAX, MUG_GRADIENT_HEIGHT_MIN } from "@/lib/mug/mugSurface";
import { printMethodsSchema } from "@/lib/stock/unified/printMethods";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminMugProductJson } from "@/lib/mug/toAdminMugProductJson";
import { normalizeMugCatalogCreateBody } from "@/lib/mug/mugCatalogHexNormalize";
import { createMugCatalogItem } from "@/lib/mug/mugCatalogWrite";
import { MUG_ATTRIBUTE_DEFAULTS, listMugVariants } from "@/lib/mug/mugVariant";
import { DPI_PRESETS, PRINT_DIMENSION_LIMITS } from "@/lib/printDimensions";
import { mdlPriceSchema } from "@/lib/validations";

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
  "Stop the dev server, run `npm run db:prepare` from the project root (needs PostgreSQL + valid DATABASE_URL), then `npm run dev` again.";

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

const shapeCm = z.number().min(MUG_SHAPE_LIMITS.minCm).max(MUG_SHAPE_LIMITS.maxCm);

const createBody = z.object({
  sku: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  nameRo: z.string().min(1).max(200),
  nameRu: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
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

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || !canManageMugCatalog(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Mugs = variants of the unified «Кружки» category (one variant per item).
    const rows = await listMugVariants(prisma);
    const items = rows.map(toAdminMugProductJson);
    return NextResponse.json({ items });
  } catch (e) {
    const code = prismaErrorCode(e);
    console.error("GET /api/admin/mug-products:", e);
    if (code === "P2022" || code === "P2021") {
      const debug =
        process.env.NODE_ENV === "development" ? prismaErrorDebugPayload(e) : {};
      return NextResponse.json(
        { error: "database_schema_outdated", hint: SCHEMA_DRIFT_HINT, ...debug },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = createBody.parse(normalizeMugCatalogCreateBody(raw));

    const d = MUG_ATTRIBUTE_DEFAULTS;
    const created = await prisma.$transaction((tx) =>
      createMugCatalogItem(
        tx,
        {
          sku: body.sku,
          nameRo: body.nameRo,
          nameRu: body.nameRu,
          nameEn: body.nameEn,
          stockQuantity: body.stockQuantity ?? 0,
          sellPrice: body.sellPrice ?? null,
          dealerPrice: body.dealerPrice ?? null,
          purchaseCost: body.purchaseCost ?? null,
          imageUrl: body.imageUrl ?? null,
          bodyColorHex: body.bodyColorHex ?? d.bodyColorHex,
          handleColorHex: body.handleColorHex ?? d.handleColorHex,
          innerColorHex: body.innerColorHex ?? d.innerColorHex,
          rimColorHex: body.rimColorHex ?? d.rimColorHex,
          printWidthCm: body.printWidthCm ?? d.printWidthCm,
          printHeightCm: body.printHeightCm ?? d.printHeightCm,
          printDpi: body.printDpi ?? d.printDpi,
          has3dPreview: body.has3dPreview ?? d.has3dPreview,
          finish: body.finish ?? d.finish,
          gradientColorHex: body.gradientColorHex ?? d.gradientColorHex,
          gradientHeightPct: body.gradientHeightPct ?? d.gradientHeightPct,
          bodyHeightCm: body.bodyHeightCm ?? d.bodyHeightCm,
          topDiameterCm: body.topDiameterCm ?? d.topDiameterCm,
          bottomDiameterCm: body.bottomDiameterCm ?? d.bottomDiameterCm,
          handleStyle: body.handleStyle ?? d.handleStyle,
          printMethods: body.printMethods ?? [],
          isActive: body.isActive ?? true,
          sortOrder: body.sortOrder ?? 0,
          internalNotes: body.internalNotes ?? null,
        },
        user.id,
      ),
    );

    return NextResponse.json({ item: toAdminMugProductJson(created) });
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
    console.error("POST /api/admin/mug-products:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
