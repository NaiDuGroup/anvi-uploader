import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { catalogPrintCmDecimal } from "@/lib/catalogPrintDecimal";
import { getSessionUser } from "@/lib/auth";
import { canManageNotebookCatalog } from "@/lib/roles";
import { toAdminNotebookProductJson } from "@/lib/notebook/toAdminNotebookProductJson";
import { normalizeNotebookCatalogCreateBody } from "@/lib/notebook/notebookCatalogHexNormalize";
import {
  DPI_PRESETS,
  NOTEBOOK_DEFAULT_PRINT,
  PRINT_DIMENSION_LIMITS,
} from "@/lib/printDimensions";
import {
  NOTEBOOK_PAPER_KIND_DEFAULT,
  notebookPaperKindZod,
} from "@/lib/notebook/notebookPaperKind";

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

const createBody = z.object({
  sku: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  nameRo: z.string().min(1).max(200),
  nameRu: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  stockQuantity: z.number().int().min(0).max(999_999).optional(),
  sellPrice: z.number().int().min(0).max(99_999_999).nullable().optional(),
  dealerPrice: z.number().int().min(0).max(99_999_999).nullable().optional(),
  purchaseCost: z.number().int().min(0).max(99_999_999).nullable().optional(),
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

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || !canManageNotebookCatalog(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await prisma.notebookProduct.findMany({
      orderBy: [{ sortOrder: "asc" }, { sku: "asc" }],
    });
    const items = rows.map(toAdminNotebookProductJson);
    return NextResponse.json({ items });
  } catch (e) {
    const code = prismaErrorCode(e);
    console.error("GET /api/admin/notebook-products:", e);
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
  if (!user || !canManageNotebookCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = createBody.parse(normalizeNotebookCatalogCreateBody(raw));

    const created = await prisma.notebookProduct.create({
      data: {
        sku: body.sku.trim().toUpperCase(),
        nameRo: body.nameRo.trim(),
        nameRu: body.nameRu.trim(),
        nameEn: body.nameEn.trim(),
        stockQuantity: body.stockQuantity ?? 0,
        sellPrice: body.sellPrice ?? null,
        dealerPrice: body.dealerPrice ?? null,
        purchaseCost: body.purchaseCost ?? null,
        imageUrl: body.imageUrl?.trim() || null,
        coverColorHex: body.coverColorHex ?? "#1f1f1f",
        strapColorHex: body.strapColorHex ?? "#1f1f1f",
        bookmarkColorHex: body.bookmarkColorHex ?? "#c0392b",
        paperKind: body.paperKind ?? NOTEBOOK_PAPER_KIND_DEFAULT,
        printWidthCm: catalogPrintCmDecimal(body.printWidthCm ?? NOTEBOOK_DEFAULT_PRINT.widthCm),
        printHeightCm: catalogPrintCmDecimal(body.printHeightCm ?? NOTEBOOK_DEFAULT_PRINT.heightCm),
        printDpi: body.printDpi ?? NOTEBOOK_DEFAULT_PRINT.dpi,
        has3dPreview: body.has3dPreview ?? true,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
        internalNotes: body.internalNotes?.trim() || null,
        createdById: user.id,
      },
    });

    return NextResponse.json({ item: toAdminNotebookProductJson(created) });
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
    console.error("POST /api/admin/notebook-products:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
