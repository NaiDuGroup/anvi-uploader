import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
  prismaKnownErrorDebugPayload,
} from "@/lib/adminCatalogPrismaErrors";
import { getSessionUser } from "@/lib/auth";
import { canListLargeFormatMaterials, canManageMugCatalog } from "@/lib/roles";
import { toAdminLargeFormatMaterialJson } from "@/lib/largeFormat/toAdminLargeFormatMaterialJson";
import {
  isPrismaUnknownPrintableWidthMetersError,
  lfMaterialPrintableWidthByIdsRaw,
  lfMaterialUpdatePrintableWidthMetersRaw,
} from "@/lib/largeFormat/lfMaterialPrintableWidthSql";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { parseProductionCostsJson } from "@/lib/accounting/types";

function prismaErrorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

const decimalM = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const createBody = z.object({
  name: z.string().min(1).max(200),
  rollWidthMeters: decimalM,
  printableWidthMeters: z.union([decimalM, z.null()]).optional(),
  costPerLinearMeter: z.number().int().min(0).max(99_999_999).optional(),
  finalRetailPricePerLinearMeter: z.number().int().min(0).max(99_999_999).optional().default(0),
  finalDealerPricePerLinearMeter: z.number().int().min(0).max(99_999_999).optional().default(0),
  manualFinalRetailPricePerLinearMeter: z
    .union([z.number().int().min(0).max(99_999_999), z.null()])
    .optional(),
  manualFinalDealerPricePerLinearMeter: z
    .union([z.number().int().min(0).max(99_999_999), z.null()])
    .optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || !canListLargeFormatMaterials(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lfDelegate = (
      prisma as unknown as { largeFormatMaterial?: { findMany?: unknown } }
    ).largeFormatMaterial;
    if (lfDelegate == null || typeof lfDelegate.findMany !== "function") {
      return NextResponse.json(
        {
          error: "prisma_client_outdated",
          hint: ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
        },
        { status: 503 },
      );
    }

    const acct = await getOrCreateAccountingSettings();
    const production = parseProductionCostsJson(acct.productionCosts);

    const rows = await prisma.largeFormatMaterial.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { sizePresets: true },
    });
    const printableMap = await lfMaterialPrintableWidthByIdsRaw(
      prisma,
      rows.map((r) => r.id),
    );
    return NextResponse.json({
      items: rows.map((r) => ({
        ...toAdminLargeFormatMaterialJson(r, production, r.sizePresets),
        printableWidthMeters: printableMap.get(r.id) ?? null,
      })),
    });
  } catch (e) {
    console.error("GET /api/admin/large-format-materials:", e);
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
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: "Internal error",
        ...(isDev
          ? {
              details: e instanceof Error ? e.message : String(e),
              ...prismaKnownErrorDebugPayload(e),
            }
          : {}),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lfDelegate = (
      prisma as unknown as { largeFormatMaterial?: { findMany?: unknown } }
    ).largeFormatMaterial;
    if (lfDelegate == null || typeof lfDelegate.findMany !== "function") {
      return NextResponse.json(
        {
          error: "prisma_client_outdated",
          hint: ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
        },
        { status: 503 },
      );
    }

    const body = createBody.parse(await request.json());

    const acct = await getOrCreateAccountingSettings();
    const production = parseProductionCostsJson(acct.productionCosts);

    const createDataBase = {
      name: body.name.trim(),
      rollWidthMeters: body.rollWidthMeters,
      costPerLinearMeter: body.costPerLinearMeter ?? 0,
      dealerPricePerLinearMeter: 0,
      retailPricePerLinearMeter: 0,
      dealerPrintPricePerLinearMeter: 0,
      retailPrintPricePerLinearMeter: 0,
      finalRetailPricePerLinearMeter: body.finalRetailPricePerLinearMeter,
      finalDealerPricePerLinearMeter: body.finalDealerPricePerLinearMeter,
      ...(body.manualFinalRetailPricePerLinearMeter != null
        ? { manualFinalRetailPricePerLinearMeter: body.manualFinalRetailPricePerLinearMeter }
        : {}),
      ...(body.manualFinalDealerPricePerLinearMeter != null
        ? { manualFinalDealerPricePerLinearMeter: body.manualFinalDealerPricePerLinearMeter }
        : {}),
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    };

    let row;
    try {
      row = await prisma.largeFormatMaterial.create({
        data: {
          ...createDataBase,
          ...(body.printableWidthMeters !== undefined
            ? { printableWidthMeters: body.printableWidthMeters }
            : {}),
        },
      });
    } catch (err) {
      if (
        !isPrismaUnknownPrintableWidthMetersError(err) ||
        body.printableWidthMeters === undefined
      ) {
        throw err;
      }
      row = await prisma.largeFormatMaterial.create({
        data: createDataBase,
      });
      await lfMaterialUpdatePrintableWidthMetersRaw(prisma, row.id, body.printableWidthMeters);
    }

    const printableMap = await lfMaterialPrintableWidthByIdsRaw(prisma, [row.id]);
    const presets = await prisma.lfMaterialSizePreset.findMany({
      where: { materialId: row.id },
    });
    return NextResponse.json({
      item: {
        ...toAdminLargeFormatMaterialJson(row, production, presets),
        printableWidthMeters: printableMap.get(row.id) ?? null,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/admin/large-format-materials:", e);
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
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: "Internal error",
        ...(isDev
          ? {
              details: e instanceof Error ? e.message : String(e),
              ...prismaKnownErrorDebugPayload(e),
            }
          : {}),
      },
      { status: 500 },
    );
  }
}
