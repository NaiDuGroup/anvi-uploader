import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
  prismaKnownErrorDebugPayload,
} from "@/lib/adminCatalogPrismaErrors";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { toAdminLargeFormatMaterialJson } from "@/lib/largeFormat/toAdminLargeFormatMaterialJson";
import { lfMaterialPrintableWidthByIdsRaw } from "@/lib/largeFormat/lfMaterialPrintableWidthSql";
import { findLfPricingMaterialWithPresets } from "@/lib/largeFormat/lfMaterialStock";
import {
  lfMaterialStockAttributes,
  requireLfMaterialVariantId,
  retireMaterialStockVariant,
  switchLfMaterialStockForm,
  syncMaterialStockVariant,
} from "@/lib/stock/unified/materials";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import {
  LF_FORM_SWITCH_BLOCKED_HINT,
  lfMaterialFormFieldsSchema,
  lfMaterialFormIssue,
  lfSheetRollWidthPlaceholderMeters,
} from "@/lib/largeFormat/lfMaterialFormFields";
import { parseLfMaterialForm } from "@/lib/largeFormat/lfSheet";
import {
  hasMaterialHistory,
  lfMaterialHistoryCounts,
  materialHasHistoryBody,
} from "@/lib/stock/materialArchive";

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

const patchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  rollWidthMeters: decimalM.optional(),
  printableWidthMeters: z.union([decimalM, z.null()]).optional(),
  costPerLinearMeter: z.number().int().min(0).max(99_999_999).optional(),
  finalRetailPricePerLinearMeter: z.number().int().min(0).max(99_999_999).optional(),
  finalDealerPricePerLinearMeter: z.number().int().min(0).max(99_999_999).optional(),
  manualFinalRetailPricePerLinearMeter: z
    .union([z.number().int().min(0).max(99_999_999), z.null()])
    .optional(),
  manualFinalDealerPricePerLinearMeter: z
    .union([z.number().int().min(0).max(99_999_999), z.null()])
    .optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  ...lfMaterialFormFieldsSchema,
});

class FormSwitchBlocked extends Error {}

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
    const body = patchBody.parse(await request.json());

    const existing = await prisma.largeFormatMaterial.findUnique({
      where: { id },
      select: { id: true, materialForm: true, rollWidthMeters: true, sheetWidthCm: true, sheetHeightCm: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const prevForm = parseLfMaterialForm(existing.materialForm);
    const nextForm = body.materialForm ?? prevForm;
    const isSheet = nextForm === "sheet";
    const nextSheetW: number | null =
      body.sheetWidthCm !== undefined
        ? body.sheetWidthCm
        : existing.sheetWidthCm != null
          ? Number(existing.sheetWidthCm.toString())
          : null;
    const nextSheetH: number | null =
      body.sheetHeightCm !== undefined
        ? body.sheetHeightCm
        : existing.sheetHeightCm != null
          ? Number(existing.sheetHeightCm.toString())
          : null;
    // Validate the resulting state; a roll's width only when it is sent (old rows may still be wrong).
    const issue = lfMaterialFormIssue({
      materialForm: nextForm,
      rollWidthMeters:
        body.rollWidthMeters !== undefined
          ? Number(body.rollWidthMeters)
          : nextForm === "roll" && prevForm === "sheet"
            ? Number(existing.rollWidthMeters.toString())
            : 1,
      sheetWidthCm: nextSheetW,
      sheetHeightCm: nextSheetH,
    });
    if (issue) return NextResponse.json(issue, { status: 400 });
    // Sheet material: the NOT NULL roll width follows the sheet width (never used for packing).
    const sheetRollWidth: string | null =
      isSheet && nextSheetW != null ? lfSheetRollWidthPlaceholderMeters(nextSheetW) : null;

    const data: Prisma.LargeFormatMaterialUpdateInput = {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(sheetRollWidth != null
        ? { rollWidthMeters: sheetRollWidth, printableWidthMeters: null }
        : body.rollWidthMeters !== undefined
          ? { rollWidthMeters: body.rollWidthMeters }
          : {}),
      ...(!isSheet && body.printableWidthMeters !== undefined
        ? { printableWidthMeters: body.printableWidthMeters }
        : {}),
      ...(body.materialForm !== undefined ? { materialForm: body.materialForm } : {}),
      ...(body.sheetWidthCm !== undefined
        ? { sheetWidthCm: body.sheetWidthCm == null ? null : String(body.sheetWidthCm) }
        : {}),
      ...(body.sheetHeightCm !== undefined
        ? { sheetHeightCm: body.sheetHeightCm == null ? null : String(body.sheetHeightCm) }
        : {}),
      ...(body.sheetMarginMm !== undefined ? { sheetMarginMm: body.sheetMarginMm } : {}),
      ...(body.retailPricePerSheet !== undefined ? { retailPricePerSheet: body.retailPricePerSheet } : {}),
      ...(body.dealerPricePerSheet !== undefined ? { dealerPricePerSheet: body.dealerPricePerSheet } : {}),
      ...(body.finalRetailPricePerLinearMeter !== undefined
        ? { finalRetailPricePerLinearMeter: body.finalRetailPricePerLinearMeter }
        : {}),
      ...(body.finalDealerPricePerLinearMeter !== undefined
        ? { finalDealerPricePerLinearMeter: body.finalDealerPricePerLinearMeter }
        : {}),
      ...(body.manualFinalRetailPricePerLinearMeter !== undefined
        ? { manualFinalRetailPricePerLinearMeter: body.manualFinalRetailPricePerLinearMeter }
        : {}),
      ...(body.manualFinalDealerPricePerLinearMeter !== undefined
        ? { manualFinalDealerPricePerLinearMeter: body.manualFinalDealerPricePerLinearMeter }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      // Roll (m) ↔ sheet (sheets): the stock item changes category, only while it is empty.
      if (nextForm !== prevForm) {
        await requireLfMaterialVariantId(tx, id);
        const blocked = await switchLfMaterialStockForm(tx, id, nextForm);
        if (blocked) throw new FormSwitchBlocked(blocked);
      }
      if (Object.keys(data).length > 0) {
        await tx.largeFormatMaterial.update({ where: { id }, data });
      }
      // Name, active flag, order, widths and the cost hint follow onto the stock item / variant.
      const variantId: string = await requireLfMaterialVariantId(tx, id);
      await syncMaterialStockVariant(tx, variantId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.costPerLinearMeter !== undefined ? { purchaseCost: body.costPerLinearMeter } : {}),
        ...(isSheet
          ? {
              attributes: lfMaterialStockAttributes({
                materialForm: "sheet",
                sheetWidthCm: nextSheetW,
                sheetHeightCm: nextSheetH,
              }),
            }
          : body.rollWidthMeters !== undefined || body.printableWidthMeters !== undefined
            ? {
                attributes: lfMaterialStockAttributes({
                  ...(body.rollWidthMeters !== undefined ? { rollWidthMeters: body.rollWidthMeters } : {}),
                  ...(body.printableWidthMeters !== undefined
                    ? { printableWidthMeters: body.printableWidthMeters }
                    : {}),
                }),
              }
            : {}),
      });
      return findLfPricingMaterialWithPresets(tx, id);
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const acct = await getOrCreateAccountingSettings();
    const production = parseProductionCostsJson(acct.productionCosts);
    const printableMap = await lfMaterialPrintableWidthByIdsRaw(prisma, [id]);
    return NextResponse.json({
      item: {
        ...toAdminLargeFormatMaterialJson(updated, production, updated.sizePresets),
        printableWidthMeters: printableMap.get(id) ?? null,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.flatten() }, { status: 400 });
    }
    if (e instanceof FormSwitchBlocked) {
      return NextResponse.json(
        { error: LF_FORM_SWITCH_BLOCKED_HINT, code: "lf_form_switch_has_stock" },
        { status: 409 },
      );
    }
    console.error("PATCH /api/admin/large-format-materials/[id]:", e);
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
    const existing = await prisma.largeFormatMaterial.findUnique({
      where: { id },
      select: { stockVariantId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Hard delete only for a roll that never had history; otherwise it goes to the archive
    // (Cascade / SetNull would erase receipts, write-offs, presets and order links).
    const refused: boolean = await prisma.$transaction(async (tx) => {
      const counts = await lfMaterialHistoryCounts(tx, id);
      if (counts && hasMaterialHistory(counts)) return true;
      await tx.largeFormatMaterial.delete({ where: { id } });
      // Stock item: unused here, so retiring removes it.
      if (existing.stockVariantId) await retireMaterialStockVariant(tx, existing.stockVariantId);
      return false;
    });
    if (refused) {
      return NextResponse.json(materialHasHistoryBody("lf"), { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/admin/large-format-materials/[id]:", e);
    const code = prismaErrorCode(e);
    if (code === "P2003") {
      // Still referenced by other rows (FK restrict): a clear refusal, not a 500.
      return NextResponse.json(
        { error: "Материал используется в заказах или на складе — удалить нельзя" },
        { status: 409 },
      );
    }
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
