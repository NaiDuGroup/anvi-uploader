import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { catalogPrintCmDecimal } from "@/lib/catalogPrintDecimal";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminPenProductJson } from "@/lib/pen/toAdminPenProductJson";
import {
  DPI_PRESETS,
  MUG_DEFAULT_PRINT,
  PRINT_DIMENSION_LIMITS,
} from "@/lib/printDimensions";
import { mdlPriceSchema } from "@/lib/validations";

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
  clipColorHex: hex.optional(),
  printWidthCm: printCm.optional(),
  printHeightCm: printCm.optional(),
  printDpi: printDpi.optional(),
  has3dPreview: z.boolean().optional(),
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

    const rows = await prisma.penProduct.findMany({
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { name: true, displayName: true } } },
    });

    return NextResponse.json({ products: rows.map(toAdminPenProductJson) });
  } catch (e) {
    console.error("[GET /api/admin/pen-products]", e, prismaErrorDebugPayload(e));
    return NextResponse.json(
      { error: "Internal server error", ...prismaErrorDebugPayload(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !canManageMugCatalog(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createBody.parse(body);

    const product = await prisma.penProduct.create({
      data: {
        sku: parsed.sku.trim(),
        nameRo: parsed.nameRo.trim(),
        nameRu: parsed.nameRu.trim(),
        nameEn: parsed.nameEn.trim(),
        stockQuantity: parsed.stockQuantity ?? 0,
        sellPrice: toCatalogPriceDecimal(parsed.sellPrice ?? null),
        dealerPrice: toCatalogPriceDecimal(parsed.dealerPrice ?? null),
        purchaseCost: toCatalogPriceDecimal(parsed.purchaseCost ?? null),
        imageUrl: parsed.imageUrl?.trim() || null,
        bodyColorHex: parsed.bodyColorHex ?? "#1f1f1f",
        clipColorHex: parsed.clipColorHex ?? "#c0c0c0",
        printWidthCm: catalogPrintCmDecimal(parsed.printWidthCm ?? MUG_DEFAULT_PRINT.widthCm),
        printHeightCm: catalogPrintCmDecimal(parsed.printHeightCm ?? MUG_DEFAULT_PRINT.heightCm),
        printDpi: parsed.printDpi ?? MUG_DEFAULT_PRINT.dpi,
        has3dPreview: parsed.has3dPreview ?? false,
        isActive: parsed.isActive ?? true,
        sortOrder: parsed.sortOrder ?? 0,
        internalNotes: parsed.internalNotes?.trim() || null,
        createdById: user.id,
      },
      include: { createdBy: { select: { name: true, displayName: true } } },
    });

    return NextResponse.json({ product: toAdminPenProductJson(product) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/pen-products]", e, prismaErrorDebugPayload(e));
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: e.errors }, { status: 400 });
    }
    const code = prismaErrorCode(e);
    if (code === "P2002") {
      return NextResponse.json({ error: "sku_taken" }, { status: 409 });
    }
    if (code === "P2021" || code === "P2022") {
      return NextResponse.json(
        {
          error: "database_schema_outdated",
          hint: SCHEMA_DRIFT_HINT,
          ...prismaErrorDebugPayload(e),
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error", ...prismaErrorDebugPayload(e) },
      { status: 500 },
    );
  }
}
