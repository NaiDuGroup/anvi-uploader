import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import type { AdminOrderLineInput, CreateAdminOrderInput, ProductType } from "@/lib/validations";
import { prisma } from "@/lib/prisma";
import { resolveMugProductForOrder } from "@/lib/mug/resolveMugProductForOrder";
import { mugProductToSnapshot, otherMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { resolveNotebookProductForOrder } from "@/lib/notebook/resolveNotebookProductForOrder";
import {
  notebookProductToSnapshot,
  otherNotebookProductSnapshot,
} from "@/lib/notebook/notebookProductSnapshot";
import { computeOrderProductTypeFromLines } from "@/lib/computeOrderProductType";
import {
  procurementMetaToJson,
  skuFromMugSnapshot,
  skuFromNotebookSnapshot,
  type OrderProcurementMetaItem,
} from "@/lib/orderProcurement";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { tryRecordMugStockSale } from "@/lib/mug/mugStockLedger";
import { tryRecordNotebookStockSale } from "@/lib/notebook/notebookStockLedger";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { getOrCreateInkInventory } from "@/lib/ink/inkInventory";
import { INK_STOCK_KIND } from "@/lib/ink/inkStockKinds";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";
import {
  computeLfRollOrderEconomics,
  effectiveLfMaterialCostPerLinearMeterMdl,
  lfRollEconomicsWithRevenueMargin,
} from "@/lib/largeFormat/lfRollOrderEconomics";
import {
  restoreLfRollStock,
  tryDeductInkMl,
  tryDeductLfRollStock,
} from "@/lib/largeFormat/lfRollStockLedger";
import {
  computeLfInkSellPriceMdl,
  lfInkMarkupMultiplierUsed,
  mergeLfPricingWithInkSell,
} from "@/lib/largeFormat/lfInkSellPricing";
import { applyLfMinimumLineSellTotalMdl } from "@/lib/largeFormat/lfMinimumLineSell";
import { computeLargeFormatLinePricing, roundMoneyMdl } from "@/lib/largeFormat/largeFormatLinePricing";
import { resolveLfSellRatesPerLinearMeterMdl } from "@/lib/largeFormat/lfResolveSellRates";
import { computeLargeFormatRollLayout } from "@/lib/largeFormat/largeFormatRollPack";
import { resolveGalleryWrapCm } from "@/lib/largeFormat/lfLayoutBorder";
import { resolveEffectivePrintableWidthMeters } from "@/lib/largeFormat/largeFormatRollConstants";
import { largeFormatMaterialToSnapshot } from "@/lib/largeFormat/toLargeFormatSnapshot";
import type { LargeFormatLineData, LfSizePresetSnapshot } from "@/lib/largeFormat/types";
import {
  applyLfSizePresetOverride,
  selectLfSizePresetPriceMdl,
} from "@/lib/largeFormat/lfPresetPricing";
import { LF_ROLL_STOCK_KIND } from "@/lib/largeFormat/lfRollStockKinds";

export type ResolvedAdminOrderLine = {
  input: AdminOrderLineInput;
  mugExtras?: {
    mugProductId: string | null;
    mugProductSnapshot: Prisma.InputJsonValue;
  };
  notebookExtras?: {
    notebookProductId: string | null;
    notebookProductSnapshot: Prisma.InputJsonValue;
  };
  largeFormatExtras?: {
    largeFormatMaterialId: string;
    largeFormatLineData: Prisma.InputJsonValue;
  };
};

export function normalizeAdminOrderLineInputs(
  validated: CreateAdminOrderInput,
): AdminOrderLineInput[] {
  if (validated.lines && validated.lines.length > 0) {
    return validated.lines;
  }
  return [
    {
      productType: validated.productType ?? "paper_print",
      mugLayoutData: validated.mugLayoutData,
      mugProductId: validated.mugProductId,
      mugOther: validated.mugOther,
      notebookLayoutData: validated.notebookLayoutData,
      notebookProductId: validated.notebookProductId,
      notebookOther: validated.notebookOther,
      files: validated.files!,
    },
  ];
}

export async function resolveAdminOrderLineProducts(
  line: AdminOrderLineInput,
): Promise<ResolvedAdminOrderLine> {
  const isMug = line.productType === "mug";
  const isNotebook = line.productType === "notebook";
  const isLargeFormat = line.productType === "large_format_print";
  let mugExtras: ResolvedAdminOrderLine["mugExtras"];
  let notebookExtras: ResolvedAdminOrderLine["notebookExtras"];
  let largeFormatExtras: ResolvedAdminOrderLine["largeFormatExtras"];

  if (isMug) {
    if (line.mugOther) {
      mugExtras = {
        mugProductId: null,
        mugProductSnapshot: otherMugProductSnapshot() as unknown as Prisma.InputJsonValue,
      };
    } else {
      const p = await resolveMugProductForOrder(line.mugProductId!);
      if (!p) {
        throw new AdminOrderResolveError("Invalid mug product");
      }
      mugExtras = {
        mugProductId: p.id,
        mugProductSnapshot: mugProductToSnapshot(p) as unknown as Prisma.InputJsonValue,
      };
    }
  }

  if (isNotebook) {
    if (line.notebookOther) {
      notebookExtras = {
        notebookProductId: null,
        notebookProductSnapshot:
          otherNotebookProductSnapshot() as unknown as Prisma.InputJsonValue,
      };
    } else {
      const p = await resolveNotebookProductForOrder(line.notebookProductId!);
      if (!p) {
        throw new AdminOrderResolveError("Invalid notebook product");
      }
      notebookExtras = {
        notebookProductId: p.id,
        notebookProductSnapshot:
          notebookProductToSnapshot(p) as unknown as Prisma.InputJsonValue,
      };
    }
  }

  if (isLargeFormat) {
    const matId = line.largeFormatMaterialId!;
    const m = await prisma.largeFormatMaterial.findUnique({
      where: { id: matId },
    });
    if (!m || !m.isActive) {
      throw new AdminOrderResolveError("Invalid large format material");
    }
    const printableM = resolveEffectivePrintableWidthMeters({
      printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
      rollWidthMeters: m.rollWidthMeters.toString(),
    });
    const printableCm = printableM * 100;
    // Canvas ("Panza din bumbac") adds a mirrored gallery-wrap margin on every
    // side: the printed/material size grows by 2 × wrap per axis while the
    // entered size stays the visible face. Pricing, packing and ink economics
    // all use the wrapped size; only the stored face dims stay un-inflated.
    const galleryWrapCm = resolveGalleryWrapCm(m.name);
    const effPrintWidthCm = line.printWidthCm! + 2 * galleryWrapCm;
    const effPrintHeightCm = line.printHeightCm! + 2 * galleryWrapCm;
    const pack = computeLargeFormatRollLayout({
      printableWidthCm: printableCm,
      nominalRollWidthMeters: Number(m.rollWidthMeters),
      printWidthCm: effPrintWidthCm,
      printHeightCm: effPrintHeightCm,
      quantity: line.quantity!,
    });
    if (!pack.ok) {
      throw new AdminOrderResolveError(
        pack.code === "quantity_too_large" ? "lf_pack_quantity_too_large" : "lf_pack_does_not_fit",
      );
    }
    const acct = await getOrCreateAccountingSettings();
    const prod = parseProductionCostsJson(acct.productionCosts);
    const effLm = effectiveLfMaterialCostPerLinearMeterMdl(m);
    const resolvedSell = resolveLfSellRatesPerLinearMeterMdl({
      effectiveMaterialCostPerLinearMeterMdl: effLm,
      production: prod,
      material: m,
    });
    const snap = largeFormatMaterialToSnapshot(m, resolvedSell);
    const pricingMat = computeLargeFormatLinePricing({
      calculatedLinearMeters: pack.layout.calculatedLinearMeters,
      customerType: line.customerType!,
      material: {
        costPerLinearMeter: effLm,
        finalRetailPricePerLinearMeter: resolvedSell.finalRetailPricePerLinearMeter,
        finalDealerPricePerLinearMeter: resolvedSell.finalDealerPricePerLinearMeter,
        dealerPricePerLinearMeter: m.dealerPricePerLinearMeter,
        retailPricePerLinearMeter: m.retailPricePerLinearMeter,
        dealerPrintPricePerLinearMeter: m.dealerPrintPricePerLinearMeter,
        retailPrintPricePerLinearMeter: m.retailPrintPricePerLinearMeter,
      },
    });

    const inkInv = await getOrCreateInkInventory(prisma, DEFAULT_PRINT_PROCESS);
    const rollW = Number(m.rollWidthMeters);
    const econCosts = computeLfRollOrderEconomics({
      printWidthCm: effPrintWidthCm,
      printHeightCm: effPrintHeightCm,
      quantity: line.quantity!,
      calculatedLinearMeters: pack.layout.calculatedLinearMeters,
      rollWidthMeters: rollW,
      effectiveMaterialCostPerLinearMeterMdl: effLm,
      inkMlPerSqm: prod.inkMlPerSqmLargeFormatRoll,
      avgInkCostPerMlMdl: Number(inkInv.avgCostPerMl),
      totalSellPriceMdl: pricingMat.materialSellPrice,
    });

    /** When a size preset is supplied, fetch + validate it; otherwise null. */
    let presetSnapshot: LfSizePresetSnapshot | undefined;
    if (line.lfSizePresetId) {
      const preset = await prisma.lfMaterialSizePreset.findUnique({
        where: { id: line.lfSizePresetId },
      });
      if (!preset || preset.materialId !== m.id || !preset.isActive) {
        throw new AdminOrderResolveError("lf_size_preset_invalid");
      }
      presetSnapshot = {
        presetId: preset.id,
        widthCm: preset.widthCm,
        heightCm: preset.heightCm,
        unitPriceMdl: selectLfSizePresetPriceMdl(preset, line.customerType!),
        customerType: line.customerType!,
      };
    }

    const inkSellMdl = presetSnapshot
      ? 0
      : computeLfInkSellPriceMdl(econCosts.inkCostMdl, line.customerType!, prod);
    const multiplierUsedSnapshot = lfInkMarkupMultiplierUsed(line.customerType!, prod);

    let pricingFinal: ReturnType<typeof computeLargeFormatLinePricing>;
    let lfMinUpliftMdl = 0;

    if (presetSnapshot) {
      /** Preset locks the line total — bypass ink markup merge + minimum uplift entirely. */
      pricingFinal = applyLfSizePresetOverride({
        pricing: pricingMat,
        presetPriceMdl: presetSnapshot.unitPriceMdl,
        quantity: line.quantity!,
        inkCostMdl: econCosts.inkCostMdl,
      });
    } else {
      const pricing = mergeLfPricingWithInkSell(pricingMat, inkSellMdl);
      const uplifted = applyLfMinimumLineSellTotalMdl(pricing, prod.lfMinimumLineTotalMdl);
      pricingFinal = uplifted.pricing;
      lfMinUpliftMdl = uplifted.upliftMdl;
    }

    const econ = lfRollEconomicsWithRevenueMargin(econCosts, pricingFinal.totalSellPrice);
    const inkSellPerSqmMdl =
      econCosts.usefulAreaSqm > 1e-9 ? roundMoneyMdl(inkSellMdl / econCosts.usefulAreaSqm) : 0;

    const lineData: LargeFormatLineData = {
      materialSnapshot: snap,
      ...(presetSnapshot ? { sizePresetSnapshot: presetSnapshot } : {}),
      printWidthCm: line.printWidthCm!,
      printHeightCm: line.printHeightCm!,
      ...(galleryWrapCm > 0 ? { galleryWrapCm } : {}),
      quantity: line.quantity!,
      customerType: line.customerType!,
      ...pricingFinal,
      materialCost: econ.materialPurchaseCostMdl,
      estimatedProfit: pricingFinal.totalSellPrice - econ.totalDirectCostMdl,
      usefulAreaSqm: econ.usefulAreaSqm,
      writtenOffAreaSqm: econ.writtenOffAreaSqm,
      materialEfficiencyPct: econ.materialEfficiencyPct,
      materialPurchaseCostMdl: econ.materialPurchaseCostMdl,
      inkMlUsed: econ.inkMlUsed,
      inkCostMdl: econ.inkCostMdl,
      inkSellPriceMdl: inkSellMdl > 0 ? inkSellMdl : undefined,
      lfInkMarkupMultiplierUsed:
        inkSellMdl > 0 ? multiplierUsedSnapshot : undefined,
      inkSellPerSqmMdl:
        inkSellMdl > 0 && inkSellPerSqmMdl >= 0 ? inkSellPerSqmMdl : undefined,
      lfMinimumLineTotalSettingMdl:
        lfMinUpliftMdl > 0 ? prod.lfMinimumLineTotalMdl : undefined,
      lfMinimumLineSellUpliftMdl: lfMinUpliftMdl > 0 ? lfMinUpliftMdl : undefined,
      totalDirectCostMdl: econ.totalDirectCostMdl,
      marginPercent: econ.marginPercent,
      avgMaterialCostPerLinearMeterSnapshot: effLm,
      avgInkCostPerMlSnapshot: Number(inkInv.avgCostPerMl),
      inkMlPerSqmSettingUsed: prod.inkMlPerSqmLargeFormatRoll,
      inkCostPerSqmMdl: econ.inkCostPerSqmMdl,
      layout: {
        algorithmVersion: pack.layout.algorithmVersion,
        printableWidthCm: pack.layout.printableWidthCm,
        nominalRollWidthMeters: pack.layout.nominalRollWidthMeters,
        placements: pack.layout.placements.map((p) => ({
          xCm: p.xCm,
          yCm: p.yCm,
          crossCm: p.crossCm,
          alongCm: p.alongCm,
          rotated: p.rotated,
        })),
      },
    };
    largeFormatExtras = {
      largeFormatMaterialId: m.id,
      largeFormatLineData: lineData as unknown as Prisma.InputJsonValue,
    };
  }

  return { input: line, mugExtras, notebookExtras, largeFormatExtras };
}

export class AdminOrderResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderResolveError";
  }
}

export function computeOrderProductTypeForAdmin(
  resolved: ResolvedAdminOrderLine[],
): ProductType | "mixed" {
  return computeOrderProductTypeFromLines(
    resolved.map((r) => ({ productType: r.input.productType })),
  );
}

export function buildOrderDenormalizedScalars(
  orderProductType: ProductType | "mixed",
  resolved: ResolvedAdminOrderLine[],
): {
  productType: string;
  mugLayoutData: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
  mugProductId: string | null;
  mugProductSnapshot: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
  notebookLayoutData: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
  notebookProductId: string | null;
  notebookProductSnapshot: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
} {
  if (orderProductType === "mixed") {
    return {
      productType: "mixed",
      mugLayoutData: PrismaNs.JsonNull,
      mugProductId: null,
      mugProductSnapshot: PrismaNs.JsonNull,
      notebookLayoutData: PrismaNs.JsonNull,
      notebookProductId: null,
      notebookProductSnapshot: PrismaNs.JsonNull,
    };
  }
  const first = resolved[0]!;
  const li = first.input;
  if (orderProductType === "mug") {
    return {
      productType: "mug",
      mugLayoutData:
        li.mugLayoutData != null
          ? (li.mugLayoutData as unknown as Prisma.InputJsonValue)
          : PrismaNs.JsonNull,
      mugProductId: first.mugExtras?.mugProductId ?? null,
      mugProductSnapshot: first.mugExtras?.mugProductSnapshot ?? PrismaNs.JsonNull,
      notebookLayoutData: PrismaNs.JsonNull,
      notebookProductId: null,
      notebookProductSnapshot: PrismaNs.JsonNull,
    };
  }
  if (orderProductType === "notebook") {
    return {
      productType: "notebook",
      mugLayoutData: PrismaNs.JsonNull,
      mugProductId: null,
      mugProductSnapshot: PrismaNs.JsonNull,
      notebookLayoutData:
        li.notebookLayoutData != null
          ? (li.notebookLayoutData as unknown as Prisma.InputJsonValue)
          : PrismaNs.JsonNull,
      notebookProductId: first.notebookExtras?.notebookProductId ?? null,
      notebookProductSnapshot:
        first.notebookExtras?.notebookProductSnapshot ?? PrismaNs.JsonNull,
    };
  }
  if (orderProductType === "large_format_print") {
    return {
      productType: "large_format_print",
      mugLayoutData: PrismaNs.JsonNull,
      mugProductId: null,
      mugProductSnapshot: PrismaNs.JsonNull,
      notebookLayoutData: PrismaNs.JsonNull,
      notebookProductId: null,
      notebookProductSnapshot: PrismaNs.JsonNull,
    };
  }
  return {
    productType: "paper_print",
    mugLayoutData: PrismaNs.JsonNull,
    mugProductId: null,
    mugProductSnapshot: PrismaNs.JsonNull,
    notebookLayoutData: PrismaNs.JsonNull,
    notebookProductId: null,
    notebookProductSnapshot: PrismaNs.JsonNull,
  };
}

type Tx = Prisma.TransactionClient;

export async function deductStockForAdminOrderLines(
  tx: Tx,
  params: {
    orderId: string;
    orderNumber: number;
    createdById: string;
    resolved: ResolvedAdminOrderLine[];
  },
): Promise<{ needsProcurement: boolean; procurementMeta: Prisma.InputJsonValue | undefined }> {
  const procurementIssues: OrderProcurementMetaItem[] = [];

  const dbLines = await tx.orderLine.findMany({
    where: { orderId: params.orderId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (dbLines.length !== params.resolved.length) {
    throw new Error(
      `Stock deduct out of sync: ${dbLines.length} lines vs ${params.resolved.length} resolved`,
    );
  }

  for (let i = 0; i < params.resolved.length; i++) {
    const r = params.resolved[i]!;
    const orderLineId = dbLines[i]!.id;
    const li = r.input;
    if (
      li.productType === "mug" &&
      r.mugExtras &&
      !li.mugOther &&
      r.mugExtras.mugProductId
    ) {
      const qty = mugOrderStockQuantityFromFiles(li.files);
      if (qty <= 0) {
        continue;
      }
      const mugRes = await tryRecordMugStockSale(tx, {
        mugProductId: r.mugExtras.mugProductId,
        quantity: qty,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        createdById: params.createdById,
      });
      if (!mugRes.deducted) {
        procurementIssues.push({
          kind: "mug",
          productId: mugRes.mugProductId,
          sku: skuFromMugSnapshot(r.mugExtras.mugProductSnapshot),
          requestedQty: mugRes.requested,
          stockAtOrder: mugRes.available,
        });
      }
    } else if (
      li.productType === "notebook" &&
      r.notebookExtras &&
      !li.notebookOther &&
      r.notebookExtras.notebookProductId
    ) {
      const qty = notebookOrderStockQuantityFromFiles(li.files);
      if (qty <= 0) {
        continue;
      }
      const nbRes = await tryRecordNotebookStockSale(tx, {
        notebookProductId: r.notebookExtras.notebookProductId,
        quantity: qty,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        createdById: params.createdById,
      });
      if (!nbRes.deducted) {
        procurementIssues.push({
          kind: "notebook",
          productId: nbRes.notebookProductId,
          sku: skuFromNotebookSnapshot(r.notebookExtras.notebookProductSnapshot),
          requestedQty: nbRes.requested,
          stockAtOrder: nbRes.available,
        });
      }
    } else if (li.productType === "large_format_print" && r.largeFormatExtras) {
      const data = r.largeFormatExtras.largeFormatLineData as unknown as LargeFormatLineData;
      const lm = data.calculatedLinearMeters;
      const inkMl = data.inkMlUsed ?? 0;
      const matId = r.largeFormatExtras.largeFormatMaterialId;

      const rollAudit =
        lm > 0
          ? {
              kind: LF_ROLL_STOCK_KIND.ORDER_SALE,
              orderId: params.orderId,
              orderNumber: params.orderNumber,
              orderLineId,
              materialCostMdl: Number.isFinite(data.materialCost)
                ? Math.round(data.materialCost)
                : null,
              materialSellPriceMdl: Number.isFinite(data.materialSellPrice)
                ? Math.round(data.materialSellPrice)
                : null,
              createdById: params.createdById,
            }
          : undefined;

      let rollDeducted = false;
      if (lm > 0) {
        const rollRes = await tryDeductLfRollStock(tx, matId, lm, rollAudit);
        if (!rollRes.ok) {
          procurementIssues.push({
            kind: "lf_roll",
            materialId: matId,
            requestedLinearMeters: rollRes.requested,
            stockAtOrder: rollRes.available,
          });
        } else {
          rollDeducted = true;
        }
      }
      /** Do not consume ink if roll stock was insufficient (no material consumed for that advance). */
      const canDeductInk = inkMl > 0 && (lm <= 0 || rollDeducted);
      const inkAudit =
        canDeductInk
          ? {
              kind: INK_STOCK_KIND.ORDER_SALE,
              orderId: params.orderId,
              orderNumber: params.orderNumber,
              orderLineId,
              inkCostMdl:
                data.inkCostMdl != null && Number.isFinite(data.inkCostMdl)
                  ? Math.round(data.inkCostMdl)
                  : null,
              inkSellPriceMdl:
                data.inkSellPriceMdl != null && Number.isFinite(data.inkSellPriceMdl)
                  ? Math.round(data.inkSellPriceMdl)
                  : null,
              createdById: params.createdById,
            }
          : undefined;
      if (canDeductInk) {
        const inkRes = await tryDeductInkMl(tx, inkMl, DEFAULT_PRINT_PROCESS, inkAudit);
        if (!inkRes.ok) {
          procurementIssues.push({
            kind: "ink",
            printProcess: DEFAULT_PRINT_PROCESS,
            requestedMl: inkRes.requested,
            stockAtOrder: inkRes.available,
          });
          if (rollDeducted && lm > 0) {
            await restoreLfRollStock(tx, matId, lm);
          }
        }
      }
    }
  }

  const procurementMeta =
    procurementIssues.length === 0
      ? undefined
      : procurementIssues.length === 1
        ? procurementMetaToJson(procurementIssues[0]!)
        : procurementMetaToJson(procurementIssues);

  return {
    needsProcurement: procurementIssues.length > 0,
    procurementMeta,
  };
}
