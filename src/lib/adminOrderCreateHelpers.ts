import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import type { AdminOrderLineInput, CreateAdminOrderInput, ProductType } from "@/lib/validations";
import { prisma } from "@/lib/prisma";
import { mugVariantToSnapshot, otherMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { loadMugVariant } from "@/lib/mug/mugVariant";
import {
  notebookVariantToSnapshot,
  otherNotebookProductSnapshot,
} from "@/lib/notebook/notebookProductSnapshot";
import { loadNotebookVariant } from "@/lib/notebook/notebookVariant";
import { computeOrderProductTypeFromLines } from "@/lib/computeOrderProductType";
import {
  procurementMetaToJson,
  type OrderProcurementMetaItem,
} from "@/lib/orderProcurement";
import { mugOrderStockQuantityFromFiles } from "@/lib/mug/mugOrderStockQuantity";
import { notebookOrderStockQuantityFromFiles } from "@/lib/notebook/notebookOrderStockQuantity";
import { penOrderStockQuantityFromFiles } from "@/lib/pen/penOrderStockQuantity";
import { consumeMugLineStock } from "@/lib/mug/mugOrderStock";
import { consumeNotebookLineStock } from "@/lib/notebook/notebookOrderStock";
import { consumePenLineStock } from "@/lib/pen/penOrderStock";
import { loadPenVariant } from "@/lib/pen/penVariant";
import { penVariantToSnapshot, otherPenProductSnapshot } from "@/lib/pen/penProductSnapshot";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { consumePrinterUse, printerInkCostPerMl } from "@/lib/stock/unified/printers";
import { PrinterCode, PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import {
  computeLfRollOrderEconomics,
  effectiveLfMaterialCostPerLinearMeterMdl,
  lfRollEconomicsWithRevenueMargin,
} from "@/lib/largeFormat/lfRollOrderEconomics";
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
import type {
  LargeFormatCustomerType,
  LargeFormatLineData,
  LfSizePresetSnapshot,
} from "@/lib/largeFormat/types";
import {
  applyLfSizePresetOverride,
  selectLfSizePresetPriceMdl,
} from "@/lib/largeFormat/lfPresetPricing";
import {
  isWholeSheetQuantity,
  snapQuantityToWholeSheets,
  type BusinessCardSides,
} from "@/lib/businessCard/businessCardConstants";
import {
  findSheetProductPreset,
  isSheetProductType,
  sheetFootprintFromTrim,
  sheetProductConfig,
  type SheetProductPresetId,
  type SheetProductType,
} from "@/lib/sheetProduct/sheetProductConfig";
import {
  computeBusinessCardSheetLayout,
  sheetsForQuantity,
} from "@/lib/businessCard/businessCardSheetLayout";
import {
  applyBusinessCardMinimumLineTotal,
  computeBusinessCardLinePricing,
} from "@/lib/businessCard/businessCardLinePricing";
import { sheetPaperToSnapshot } from "@/lib/businessCard/toSheetPaperSnapshot";
import { findSheetPaperPricing } from "@/lib/businessCard/sheetPaperStock";
import { findLfPricingMaterial, type LfPricingMaterial } from "@/lib/largeFormat/lfMaterialStock";
import { takeMaterialLineStock } from "@/lib/stock/unified/materialOrderStock";
import {
  BUSINESS_CARD_LAYOUT_ALGORITHM_VERSION,
  type BusinessCardCustomerType,
  type BusinessCardLineData,
} from "@/lib/businessCard/types";
import { sidesMultiplier } from "@/lib/businessCard/businessCardConstants";
import { DtfLineError } from "@/lib/dtf/dtfLineCalc";
import { deductDtfLineStock } from "@/lib/dtf/dtfOrderStock";
import { resolveDtfLine } from "@/lib/dtf/resolveDtfLine";
import type { DtfLineData } from "@/lib/dtf/types";
import { UvLineError } from "@/lib/uv/uvLineCalc";
import { deductUvLineStock } from "@/lib/uv/uvOrderStock";
import { resolveUvLine } from "@/lib/uv/resolveUvLine";
import type { UvLineData } from "@/lib/uv/types";
import { SublimationLineError } from "@/lib/sublimation/sublimationLineCalc";
import { consumeMugPrintStock, deductSublimationLineStock } from "@/lib/sublimation/sublimationOrderStock";
import { resolveSublimationLine } from "@/lib/sublimation/resolveSublimationLine";
import type { SublimationLineData } from "@/lib/sublimation/types";

/** Hard cap on positions after each file is split onto its own line. */
export const MAX_ORDER_LINES = 50;

export class OrderLineLimitError extends Error {
  readonly code = "too_many_order_lines" as const;

  constructor() {
    super("too_many_order_lines");
    this.name = "OrderLineLimitError";
  }
}

type OneFileLine<F> = {
  productType: string;
  quantity?: number;
  files: F[];
};

function fileCopies(file: object): number | undefined {
  if (!("copies" in file)) return undefined;
  const copies = (file as { copies?: unknown }).copies;
  return typeof copies === "number" ? copies : undefined;
}

/**
 * One uploaded file becomes one order line. Line settings (product, SKU,
 * material, size) are copied. For large format the new line's quantity is
 * that file's copy count, so three artworks are three prints.
 * A line that already has a single file is returned unchanged.
 *
 * Sheet products (business cards, flyers) are exempt: a double-sided run
 * carries front and back in the same line and splitting them would bill (and
 * impose) two separate runs. DTF, UV and sublimation lines are exempt too:
 * their files are the print zones / transfers of one run.
 */
export function expandToOneFilePerLine<T extends OneFileLine<F>, F>(
  lines: readonly T[],
): T[] {
  const out: T[] = [];
  for (const line of lines) {
    if (
      line.files.length <= 1 ||
      isSheetProductType(line.productType) ||
      line.productType === "dtf_apparel" ||
      line.productType === "uv_print" ||
      line.productType === "sublimation_print"
    ) {
      out.push(line);
      continue;
    }
    for (let i = 0; i < line.files.length; i++) {
      const file = line.files[i]!;
      const copies = fileCopies(file as object);
      out.push({
        ...line,
        ...("orderLineId" in line && i > 0 ? { orderLineId: undefined } : {}),
        quantity:
          line.productType === "large_format_print" && copies != null
            ? copies
            : line.quantity,
        files: [file],
      });
    }
  }
  if (out.length > MAX_ORDER_LINES) {
    throw new OrderLineLimitError();
  }
  return out;
}

export type ResolvedAdminOrderLine = {
  input: AdminOrderLineInput;
  /** Mug line: unified «Кружки» variant (null for «другая кружка») + frozen snapshot. */
  mugExtras?: {
    stockVariantId: string | null;
    mugProductSnapshot: Prisma.InputJsonValue;
  };
  /** Notebook line: unified «Блокноты» variant (null for «другой блокнот») + frozen snapshot. */
  notebookExtras?: {
    stockVariantId: string | null;
    notebookProductSnapshot: Prisma.InputJsonValue;
  };
  /** Pen line: unified «Ручки» variant (null for «другая ручка») + frozen snapshot. */
  penExtras?: {
    stockVariantId: string | null;
    penProductSnapshot: Prisma.InputJsonValue;
  };
  largeFormatExtras?: {
    largeFormatMaterialId: string;
    largeFormatLineData: Prisma.InputJsonValue;
  };
  businessCardExtras?: {
    sheetPaperId: string;
    businessCardLineData: Prisma.InputJsonValue;
    sheetsUsed: number;
  };
  dtfExtras?: {
    dtfLineData: DtfLineData;
  };
  uvExtras?: {
    uvLineData: UvLineData;
  };
  sublimationExtras?: {
    sublimationLineData: SublimationLineData;
  };
};

/** `OrderLine.stockVariantId` of a resolved line: the unified mug / pen / notebook variant, if any. */
export function resolvedLineStockVariantId(r: ResolvedAdminOrderLine): string | null {
  return (
    r.mugExtras?.stockVariantId ?? r.penExtras?.stockVariantId ?? r.notebookExtras?.stockVariantId ?? null
  );
}

export function normalizeAdminOrderLineInputs(
  validated: CreateAdminOrderInput,
): AdminOrderLineInput[] {
  const lines: AdminOrderLineInput[] =
    validated.lines && validated.lines.length > 0
      ? validated.lines
      : [
          {
            productType: validated.productType ?? "paper_print",
            mugLayoutData: validated.mugLayoutData,
            mugProductId: validated.mugProductId,
            mugOther: validated.mugOther,
            notebookLayoutData: validated.notebookLayoutData,
            notebookProductId: validated.notebookProductId,
            notebookOther: validated.notebookOther,
            penLayoutData: validated.penLayoutData,
            penProductId: validated.penProductId,
            penOther: validated.penOther,
            files: validated.files!,
          },
        ];
  return expandToOneFilePerLine(lines);
}

export async function resolveAdminOrderLineProducts(
  line: AdminOrderLineInput,
): Promise<ResolvedAdminOrderLine> {
  const isMug = line.productType === "mug";
  const isNotebook = line.productType === "notebook";
  const isPen = line.productType === "pen";
  const isLargeFormat = line.productType === "large_format_print";
  const sheetProductType = isSheetProductType(line.productType) ? line.productType : null;
  let mugExtras: ResolvedAdminOrderLine["mugExtras"];
  let notebookExtras: ResolvedAdminOrderLine["notebookExtras"];
  let penExtras: ResolvedAdminOrderLine["penExtras"];
  let largeFormatExtras: ResolvedAdminOrderLine["largeFormatExtras"];
  let businessCardExtras: ResolvedAdminOrderLine["businessCardExtras"];
  let dtfExtras: ResolvedAdminOrderLine["dtfExtras"];
  let uvExtras: ResolvedAdminOrderLine["uvExtras"];
  let sublimationExtras: ResolvedAdminOrderLine["sublimationExtras"];

  if (isMug) {
    if (line.mugOther) {
      mugExtras = {
        stockVariantId: null,
        mugProductSnapshot: otherMugProductSnapshot() as unknown as Prisma.InputJsonValue,
      };
    } else {
      // `mugProductId` carries the mug variant id (a legacy mug id still resolves).
      const v = await loadMugVariant(prisma, line.mugProductId, { activeOnly: true });
      if (!v) {
        throw new AdminOrderResolveError("Invalid mug product");
      }
      mugExtras = {
        stockVariantId: v.id,
        mugProductSnapshot: mugVariantToSnapshot(v) as unknown as Prisma.InputJsonValue,
      };
    }
  }

  if (isNotebook) {
    if (line.notebookOther) {
      notebookExtras = {
        stockVariantId: null,
        notebookProductSnapshot:
          otherNotebookProductSnapshot() as unknown as Prisma.InputJsonValue,
      };
    } else {
      // `notebookProductId` carries the notebook variant id (a legacy notebook id still resolves).
      const v = await loadNotebookVariant(prisma, line.notebookProductId, { activeOnly: true });
      if (!v) {
        throw new AdminOrderResolveError("Invalid notebook product");
      }
      notebookExtras = {
        stockVariantId: v.id,
        notebookProductSnapshot:
          notebookVariantToSnapshot(v) as unknown as Prisma.InputJsonValue,
      };
    }
  }

  if (isPen) {
    if (line.penOther) {
      penExtras = {
        stockVariantId: null,
        penProductSnapshot: otherPenProductSnapshot() as unknown as Prisma.InputJsonValue,
      };
    } else {
      // `penProductId` carries the pen variant id (a legacy pen id still resolves).
      const v = await loadPenVariant(prisma, line.penProductId, { activeOnly: true });
      if (!v) {
        throw new AdminOrderResolveError("Invalid pen product");
      }
      penExtras = {
        stockVariantId: v.id,
        penProductSnapshot: penVariantToSnapshot(v) as unknown as Prisma.InputJsonValue,
      };
    }
  }

  if (isLargeFormat) {
    const res = await resolveLargeFormatLine({
      largeFormatMaterialId: line.largeFormatMaterialId,
      materialFamilyKey: line.materialFamilyKey,
      printWidthCm: line.printWidthCm!,
      printHeightCm: line.printHeightCm!,
      quantity: line.quantity!,
      customerType: line.customerType!,
      lfSizePresetId: line.lfSizePresetId ?? null,
    });
    largeFormatExtras = {
      largeFormatMaterialId: res.largeFormatMaterialId,
      largeFormatLineData: res.largeFormatLineData as unknown as Prisma.InputJsonValue,
    };
  }

  if (sheetProductType) {
    const res = await resolveSheetProductLine({
      productType: sheetProductType,
      sheetPaperId: line.sheetPaperId!,
      quantity: line.quantity!,
      sides: line.cardSides ?? "one",
      cardPresetId: line.cardPresetId,
      cardTrimWidthCm: line.cardTrimWidthCm,
      cardTrimHeightCm: line.cardTrimHeightCm,
      customerType: line.customerType ?? "retail",
    });
    businessCardExtras = {
      sheetPaperId: res.sheetPaperId,
      businessCardLineData: res.businessCardLineData as unknown as Prisma.InputJsonValue,
      sheetsUsed: res.sheetsUsed,
    };
  }

  if (line.productType === "dtf_apparel") {
    if (!line.dtf) {
      throw new AdminOrderResolveError("dtf_details_required");
    }
    try {
      dtfExtras = {
        dtfLineData: await resolveDtfLine(line.dtf, line.customerType ?? "retail"),
      };
    } catch (e) {
      if (e instanceof DtfLineError) throw new AdminOrderResolveError(e.code);
      throw e;
    }
  }

  if (line.productType === "uv_print") {
    if (!line.uv) {
      throw new AdminOrderResolveError("uv_details_required");
    }
    try {
      uvExtras = {
        uvLineData: await resolveUvLine(line.uv, line.customerType ?? "retail"),
      };
    } catch (e) {
      if (e instanceof UvLineError) throw new AdminOrderResolveError(e.code);
      throw e;
    }
  }

  if (line.productType === "sublimation_print") {
    if (!line.sublimation) {
      throw new AdminOrderResolveError("subl_details_required");
    }
    try {
      sublimationExtras = {
        sublimationLineData: await resolveSublimationLine(line.sublimation, line.customerType ?? "retail"),
      };
    } catch (e) {
      if (e instanceof SublimationLineError) throw new AdminOrderResolveError(e.code);
      throw e;
    }
  }

  return {
    input: line,
    mugExtras,
    notebookExtras,
    penExtras,
    largeFormatExtras,
    businessCardExtras,
    dtfExtras,
    uvExtras,
    sublimationExtras,
  };
}

/**
 * Resolve a single sheet-product line (business card or flyer): validate the
 * paper, impose the piece on the sheet, price the run per printed sheet side,
 * and build the persisted {@link BusinessCardLineData} snapshot.
 *
 * Shared by the admin order pipeline ({@link resolveAdminOrderLineProducts}),
 * the cabinet order-create path (`POST /api/orders`) and the quote endpoint
 * (`POST /api/business-card-quote`), so the quoted price always equals the
 * price actually charged and stored.
 *
 * Throws {@link AdminOrderResolveError} with a stable code on invalid input.
 */
export async function resolveSheetProductLine(input: {
  productType: SheetProductType;
  sheetPaperId: string;
  quantity: number;
  sides: BusinessCardSides;
  /** Finished size standard; defaults to the product's default preset. */
  cardPresetId?: SheetProductPresetId;
  /** Required when `cardPresetId` is `"custom"`: finished size in cm. */
  cardTrimWidthCm?: number;
  cardTrimHeightCm?: number;
  customerType: BusinessCardCustomerType;
  /**
   * Quoting only: round the run up to fill whole sheets instead of rejecting it.
   * Order creation leaves this off so the stored run is exactly what the
   * customer agreed to.
   */
  snapQuantity?: boolean;
}): Promise<{
  sheetPaperId: string;
  businessCardLineData: BusinessCardLineData;
  totalSellPriceMdl: number;
  sheetsUsed: number;
}> {
  const paper = await findSheetPaperPricing(prisma, input.sheetPaperId);
  if (!paper || !paper.isActive) {
    throw new AdminOrderResolveError("bc_paper_not_found");
  }
  const config = sheetProductConfig(input.productType);
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new AdminOrderResolveError("bc_quantity_invalid");
  }
  if (input.quantity > config.maxQuantity) {
    throw new AdminOrderResolveError("bc_quantity_max");
  }

  const presetId = input.cardPresetId ?? config.defaultPresetId;
  const preset =
    presetId === "custom" ? undefined : findSheetProductPreset(input.productType, presetId);
  if (presetId !== "custom" && !preset) {
    throw new AdminOrderResolveError("bc_preset_unknown");
  }
  const cardTrimWidthCm = preset?.trimWidthCm ?? input.cardTrimWidthCm;
  const cardTrimHeightCm = preset?.trimHeightCm ?? input.cardTrimHeightCm;
  if (
    cardTrimWidthCm == null ||
    cardTrimHeightCm == null ||
    !(cardTrimWidthCm > 0) ||
    !(cardTrimHeightCm > 0)
  ) {
    throw new AdminOrderResolveError("bc_card_size_invalid");
  }
  // Artwork arrives at trim + bleed, and that larger footprint is what competes
  // for room on the sheet — 8.5 × 5.5 fits 10, not the 12 the trim size implies.
  const { cardWidthCm, cardHeightCm } = sheetFootprintFromTrim(
    cardTrimWidthCm,
    cardTrimHeightCm,
    config.bleedCm,
  );
  const paperSnapshot = sheetPaperToSnapshot(paper);

  const layout = computeBusinessCardSheetLayout({
    sheetWidthCm: paperSnapshot.sheetWidthCm,
    sheetHeightCm: paperSnapshot.sheetHeightCm,
    cardWidthCm,
    cardHeightCm,
  });
  if (layout.cardsPerSheet === 0) {
    throw new AdminOrderResolveError("bc_card_does_not_fit_sheet");
  }
  const quantity = input.snapQuantity
    ? snapQuantityToWholeSheets(input.quantity, layout.cardsPerSheet)
    : input.quantity;
  if (!isWholeSheetQuantity(quantity, layout.cardsPerSheet)) {
    throw new AdminOrderResolveError("bc_quantity_not_multiple");
  }
  if (quantity > config.maxQuantity) {
    throw new AdminOrderResolveError("bc_quantity_max");
  }

  const sheetsUsed = sheetsForQuantity(quantity, layout.cardsPerSheet);

  const acct = await getOrCreateAccountingSettings();
  const prod = parseProductionCostsJson(acct.productionCosts);

  const base = computeBusinessCardLinePricing({
    paperSnapshot,
    avgPaperCostPerSheet: paper.avgCostPerSheet,
    sheetsUsed,
    sides: input.sides,
    customerType: input.customerType,
  });
  const { pricing, upliftMdl } = config.appliesMinimumLineTotal
    ? applyBusinessCardMinimumLineTotal(base, prod.bcMinimumLineTotalMdl)
    : { pricing: base, upliftMdl: 0 };

  const businessCardLineData: BusinessCardLineData = {
    paperSnapshot,
    cardWidthCm,
    cardHeightCm,
    presetId,
    cardTrimWidthCm,
    cardTrimHeightCm,
    bleedCm: config.bleedCm,
    sides: input.sides,
    quantity,
    cardsPerSheet: layout.cardsPerSheet,
    sheetsUsed,
    customerType: input.customerType,
    layout: {
      algorithmVersion: BUSINESS_CARD_LAYOUT_ALGORITHM_VERSION,
      columns: layout.columns,
      rows: layout.rows,
      cardsPerSheet: layout.cardsPerSheet,
      rotated: layout.rotated,
      gapCm: layout.gapCm,
      marginXCm: layout.marginXCm,
      marginYCm: layout.marginYCm,
      slotWidthCm: layout.slotWidthCm,
      slotHeightCm: layout.slotHeightCm,
    },
    pricePerSheetMdl: pricing.pricePerSheetMdl,
    totalSellPriceMdl: pricing.totalSellPriceMdl,
    paperCostMdl: pricing.paperCostMdl,
    avgPaperCostPerSheetSnapshot: pricing.avgPaperCostPerSheetSnapshot,
    estimatedProfitMdl: pricing.estimatedProfitMdl,
    ...(upliftMdl > 0
      ? {
          minimumLineTotalSettingMdl: prod.bcMinimumLineTotalMdl,
          minimumLineUpliftMdl: upliftMdl,
        }
      : {}),
  };

  return {
    sheetPaperId: paper.id,
    businessCardLineData,
    totalSellPriceMdl: pricing.totalSellPriceMdl,
    sheetsUsed,
  };
}

/**
 * Resolve a single large-format line: validate material + optional size preset,
 * compute roll layout, pricing (material + ink sell or preset override),
 * economics, and build the persisted {@link LargeFormatLineData} snapshot.
 *
 * Supports two modes:
 * 1. **Concrete roll**: pass `largeFormatMaterialId` — bills on that specific roll.
 * 2. **Material family**: pass `materialFamilyKey` — picks the minimally
 *    sufficient roll from the family and bills on that roll. Workshop may later
 *    print on a different family roll without changing the locked sell price.
 *
 * Shared by the admin order pipeline ({@link resolveAdminOrderLineProducts}),
 * the cabinet order-create path (`POST /api/orders`) and the price quote
 * endpoint (`POST /api/large-format-quote`) so the quoted price always equals
 * the price actually charged and stored.
 *
 * Throws {@link AdminOrderResolveError} with a stable code on invalid input.
 */
export async function resolveLargeFormatLine(input: {
  largeFormatMaterialId?: string;
  materialFamilyKey?: string;
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  customerType: LargeFormatCustomerType;
  lfSizePresetId?: string | null;
}): Promise<{
  largeFormatMaterialId: string;
  largeFormatLineData: LargeFormatLineData;
  totalSellPriceMdl: number;
  calculatedLinearMeters: number;
}> {
  // Exactly one of materialId or familyKey must be provided.
  if (!input.largeFormatMaterialId && !input.materialFamilyKey) {
    throw new AdminOrderResolveError("Must provide largeFormatMaterialId or materialFamilyKey");
  }
  if (input.largeFormatMaterialId && input.materialFamilyKey) {
    throw new AdminOrderResolveError("Cannot provide both materialId and familyKey");
  }

  let m: LfPricingMaterial | null;
  let useFamilyBilling = false;
  let familyKey: string | undefined;

  if (input.materialFamilyKey) {
    // Material family mode: pick the cheapest-total-cost roll (may be wider
    // than the narrowest sufficient when packing benefits it).
    familyKey = input.materialFamilyKey;
    const { fetchFamilyRolls } = await import("./largeFormat/lfFamilyBilling");
    const { pickCheapestFamilyRollForTiles } = await import(
      "./largeFormat/lfCrossLinePacking"
    );

    const familyRolls = await fetchFamilyRolls(prisma, familyKey);
    if (familyRolls.length === 0) {
      throw new AdminOrderResolveError("lf_family_not_found");
    }

    // Family members share the same base material → same gallery-wrap policy.
    const galleryWrapCmFamily = resolveGalleryWrapCm(familyRolls[0]!.name);
    const effW = input.printWidthCm + 2 * galleryWrapCmFamily;
    const effH = input.printHeightCm + 2 * galleryWrapCmFamily;

    const tilesForPick: import("./largeFormat/groupTilePack").GroupTilePackTile[] =
      [];
    for (let i = 1; i <= input.quantity; i++) {
      tilesForPick.push({
        id: `T${i}`,
        label: `Copy ${i}`,
        widthCm: effW,
        heightCm: effH,
        allowRotate: true,
      });
    }

    const acctPre = await getOrCreateAccountingSettings();
    const prodPre = parseProductionCostsJson(acctPre.productionCosts);

    const cheapest = await pickCheapestFamilyRollForTiles({
      familyRolls,
      tiles: tilesForPick,
      customerType: input.customerType,
      prod: prodPre,
    });
    if (!cheapest) {
      throw new AdminOrderResolveError("lf_pack_does_not_fit");
    }

    m = cheapest.mat;
    useFamilyBilling = true;
  } else {
    // Concrete roll mode: use the provided material ID.
    m = await findLfPricingMaterial(prisma, input.largeFormatMaterialId!);
    if (!m || !m.isActive) {
      throw new AdminOrderResolveError("Invalid large format material");
    }
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
  const effPrintWidthCm = input.printWidthCm + 2 * galleryWrapCm;
  const effPrintHeightCm = input.printHeightCm + 2 * galleryWrapCm;
  const pack = computeLargeFormatRollLayout({
    printableWidthCm: printableCm,
    nominalRollWidthMeters: Number(m.rollWidthMeters),
    printWidthCm: effPrintWidthCm,
    printHeightCm: effPrintHeightCm,
    quantity: input.quantity,
  });
  if (!pack.ok) {
    throw new AdminOrderResolveError(
      pack.code === "quantity_too_large"
        ? "lf_pack_quantity_too_large"
        : "lf_pack_does_not_fit",
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
    customerType: input.customerType,
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

  const avgInkCostPerMl: number = (await printerInkCostPerMl(prisma, PrinterCode.LargeFormat)) ?? 0;
  const rollW = Number(m.rollWidthMeters);
  const econCosts = computeLfRollOrderEconomics({
    printWidthCm: effPrintWidthCm,
    printHeightCm: effPrintHeightCm,
    quantity: input.quantity,
    calculatedLinearMeters: pack.layout.calculatedLinearMeters,
    rollWidthMeters: rollW,
    effectiveMaterialCostPerLinearMeterMdl: effLm,
    inkMlPerSqm: prod.inkMlPerSqmLargeFormatRoll,
    avgInkCostPerMlMdl: avgInkCostPerMl,
    totalSellPriceMdl: pricingMat.materialSellPrice,
  });

  /** When a size preset is supplied, fetch + validate it; otherwise null. */
  let presetSnapshot: LfSizePresetSnapshot | undefined;
  if (input.lfSizePresetId) {
    const preset = await prisma.lfMaterialSizePreset.findUnique({
      where: { id: input.lfSizePresetId },
    });
    if (!preset || preset.materialId !== m.id || !preset.isActive) {
      throw new AdminOrderResolveError("lf_size_preset_invalid");
    }
    presetSnapshot = {
      presetId: preset.id,
      widthCm: preset.widthCm,
      heightCm: preset.heightCm,
      unitPriceMdl: selectLfSizePresetPriceMdl(preset, input.customerType),
      customerType: input.customerType,
    };
  }

  const inkSellMdl = presetSnapshot
    ? 0
    : computeLfInkSellPriceMdl(econCosts.inkCostMdl, input.customerType, prod);
  const multiplierUsedSnapshot = lfInkMarkupMultiplierUsed(input.customerType, prod);

  let pricingFinal: ReturnType<typeof computeLargeFormatLinePricing>;
  let lfMinUpliftMdl = 0;

  if (presetSnapshot) {
    /** Preset locks the line total — bypass ink markup merge + minimum uplift entirely. */
    pricingFinal = applyLfSizePresetOverride({
      pricing: pricingMat,
      presetPriceMdl: presetSnapshot.unitPriceMdl,
      quantity: input.quantity,
      inkCostMdl: econCosts.inkCostMdl,
    });
  } else {
    const pricing = mergeLfPricingWithInkSell(pricingMat, inkSellMdl);
    // Dealers are exempt from the per-line minimum total — they always get the
    // best price. Retail keeps the configured floor.
    const effectiveMinTotalMdl =
      input.customerType === "dealer" ? 0 : prod.lfMinimumLineTotalMdl;
    const uplifted = applyLfMinimumLineSellTotalMdl(pricing, effectiveMinTotalMdl);
    pricingFinal = uplifted.pricing;
    lfMinUpliftMdl = uplifted.upliftMdl;
  }

  const econ = lfRollEconomicsWithRevenueMargin(econCosts, pricingFinal.totalSellPrice);
  const inkSellPerSqmMdl =
    econCosts.usefulAreaSqm > 1e-9 ? roundMoneyMdl(inkSellMdl / econCosts.usefulAreaSqm) : 0;

  const lineData: LargeFormatLineData = {
    materialSnapshot: snap,
    ...(presetSnapshot ? { sizePresetSnapshot: presetSnapshot } : {}),
    ...(useFamilyBilling && familyKey
      ? {
          pricingPolicy: "min_sufficient_width" as const,
          materialFamilyKey: familyKey,
          billingRoll: {
            materialId: m.id,
            materialSnapshot: snap,
          },
        }
      : {}),
    printWidthCm: input.printWidthCm,
    printHeightCm: input.printHeightCm,
    ...(galleryWrapCm > 0 ? { galleryWrapCm } : {}),
    quantity: input.quantity,
    customerType: input.customerType,
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
    lfInkMarkupMultiplierUsed: inkSellMdl > 0 ? multiplierUsedSnapshot : undefined,
    inkSellPerSqmMdl:
      inkSellMdl > 0 && inkSellPerSqmMdl >= 0 ? inkSellPerSqmMdl : undefined,
    lfMinimumLineTotalSettingMdl:
      lfMinUpliftMdl > 0 ? prod.lfMinimumLineTotalMdl : undefined,
    lfMinimumLineSellUpliftMdl: lfMinUpliftMdl > 0 ? lfMinUpliftMdl : undefined,
    totalDirectCostMdl: econ.totalDirectCostMdl,
    marginPercent: econ.marginPercent,
    avgMaterialCostPerLinearMeterSnapshot: effLm,
    avgInkCostPerMlSnapshot: avgInkCostPerMl,
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

  return {
    largeFormatMaterialId: m.id,
    largeFormatLineData: lineData,
    totalSellPriceMdl: pricingFinal.totalSellPrice,
    calculatedLinearMeters: pack.layout.calculatedLinearMeters,
  };
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
  mugProductSnapshot: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
  notebookLayoutData: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
  notebookProductSnapshot: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
  penProductSnapshot: Prisma.InputJsonValue | typeof PrismaNs.JsonNull;
} {
  if (orderProductType === "mixed") {
    return {
      productType: "mixed",
      mugLayoutData: PrismaNs.JsonNull,
      mugProductSnapshot: PrismaNs.JsonNull,
      notebookLayoutData: PrismaNs.JsonNull,
      notebookProductSnapshot: PrismaNs.JsonNull,
      penProductSnapshot: PrismaNs.JsonNull,
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
      mugProductSnapshot: first.mugExtras?.mugProductSnapshot ?? PrismaNs.JsonNull,
      notebookLayoutData: PrismaNs.JsonNull,
      notebookProductSnapshot: PrismaNs.JsonNull,
      penProductSnapshot: PrismaNs.JsonNull,
    };
  }
  if (orderProductType === "notebook") {
    return {
      productType: "notebook",
      mugLayoutData: PrismaNs.JsonNull,
      mugProductSnapshot: PrismaNs.JsonNull,
      notebookLayoutData:
        li.notebookLayoutData != null
          ? (li.notebookLayoutData as unknown as Prisma.InputJsonValue)
          : PrismaNs.JsonNull,
      notebookProductSnapshot:
        first.notebookExtras?.notebookProductSnapshot ?? PrismaNs.JsonNull,
      penProductSnapshot: PrismaNs.JsonNull,
    };
  }
  if (orderProductType === "pen") {
    return {
      productType: "pen",
      mugLayoutData: PrismaNs.JsonNull,
      mugProductSnapshot: PrismaNs.JsonNull,
      notebookLayoutData: PrismaNs.JsonNull,
      notebookProductSnapshot: PrismaNs.JsonNull,
      penProductSnapshot: first.penExtras?.penProductSnapshot ?? PrismaNs.JsonNull,
    };
  }
  if (orderProductType === "large_format_print") {
    return {
      productType: "large_format_print",
      mugLayoutData: PrismaNs.JsonNull,
      mugProductSnapshot: PrismaNs.JsonNull,
      notebookLayoutData: PrismaNs.JsonNull,
      notebookProductSnapshot: PrismaNs.JsonNull,
      penProductSnapshot: PrismaNs.JsonNull,
    };
  }
  // Remaining types (paper_print, business_card, flyer) carry no denormalized
  // product snapshot, so only the order-level product type is echoed back.
  return {
    productType: orderProductType,
    mugLayoutData: PrismaNs.JsonNull,
    mugProductSnapshot: PrismaNs.JsonNull,
    notebookLayoutData: PrismaNs.JsonNull,
    notebookProductSnapshot: PrismaNs.JsonNull,
    penProductSnapshot: PrismaNs.JsonNull,
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
    // Every printed mug (stock or «other») uses Epson paper / tape / ink by the `mugs` norm.
    if (li.productType === "mug") {
      await consumeMugPrintStock(tx, {
        quantity: mugOrderStockQuantityFromFiles(li.files),
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
    }
    if (
      li.productType === "mug" &&
      r.mugExtras &&
      !li.mugOther &&
      r.mugExtras.stockVariantId
    ) {
      const issue = await consumeMugLineStock(tx, {
        variantId: r.mugExtras.stockVariantId,
        quantity: mugOrderStockQuantityFromFiles(li.files),
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
        snapshot: r.mugExtras.mugProductSnapshot,
      });
      if (issue) procurementIssues.push(issue);
    } else if (
      li.productType === "notebook" &&
      r.notebookExtras &&
      !li.notebookOther &&
      r.notebookExtras.stockVariantId
    ) {
      const issue = await consumeNotebookLineStock(tx, {
        variantId: r.notebookExtras.stockVariantId,
        quantity: notebookOrderStockQuantityFromFiles(li.files),
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
        snapshot: r.notebookExtras.notebookProductSnapshot,
      });
      if (issue) procurementIssues.push(issue);
    } else if (
      li.productType === "pen" &&
      r.penExtras &&
      !li.penOther &&
      r.penExtras.stockVariantId
    ) {
      const issue = await consumePenLineStock(tx, {
        variantId: r.penExtras.stockVariantId,
        quantity: penOrderStockQuantityFromFiles(li.files),
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
        snapshot: r.penExtras.penProductSnapshot,
      });
      if (issue) procurementIssues.push(issue);
    } else if (li.productType === "large_format_print" && r.largeFormatExtras) {
      const data = r.largeFormatExtras.largeFormatLineData as unknown as LargeFormatLineData;
      const inkMl = data.inkMlUsed ?? 0;
      // Roll metres from the roll's unified variant; short → `lf_roll` entry, nothing taken.
      const rollIssue = await takeMaterialLineStock(tx, {
        kind: "roll",
        materialId: r.largeFormatExtras.largeFormatMaterialId,
        quantity: data.calculatedLinearMeters,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
      if (rollIssue) procurementIssues.push(rollIssue);
      // Ink is a printer consumable: it never blocks the order (the colours may go below zero).
      await consumePrinterUse(tx, {
        printerCode: PrinterCode.LargeFormat,
        role: PrinterSlotRole.Ink,
        amount: inkMl,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
    } else if (li.productType === "dtf_apparel" && r.dtfExtras) {
      const issues = await deductDtfLineStock(tx, r.dtfExtras.dtfLineData, {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
      procurementIssues.push(...issues);
    } else if (li.productType === "uv_print" && r.uvExtras) {
      const issues = await deductUvLineStock(tx, r.uvExtras.uvLineData, {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
      procurementIssues.push(...issues);
    } else if (li.productType === "sublimation_print" && r.sublimationExtras) {
      const issues = await deductSublimationLineStock(tx, r.sublimationExtras.sublimationLineData, {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
      procurementIssues.push(...issues);
    } else if (isSheetProductType(li.productType) && r.businessCardExtras) {
      const data = r.businessCardExtras
        .businessCardLineData as unknown as BusinessCardLineData;
      const sheets = r.businessCardExtras.sheetsUsed;
      if (sheets <= 0) {
        continue;
      }
      // Paper sheets from the paper's unified variant; short → `sheet_paper` entry, nothing taken.
      const paperIssue = await takeMaterialLineStock(tx, {
        kind: "sheet",
        materialId: r.businessCardExtras.sheetPaperId,
        quantity: sheets,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
      if (paperIssue) procurementIssues.push(paperIssue);
      // Ricoh toner per printed side (cartridge yield is quoted per page); never blocks,
      // writes nothing until yields are set.
      await consumePrinterUse(tx, {
        printerCode: PrinterCode.Ricoh,
        role: PrinterSlotRole.Toner,
        amount: sheets * sidesMultiplier(data.sides),
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        orderLineId,
        createdById: params.createdById,
      });
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
