"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useOrdersStore } from "@/stores/useOrdersStore";
import type { SizeValidationResult } from "@/lib/imageDimensions";
import { getImageDimensions, validateLayoutSize } from "@/lib/imageDimensions";
import { cmToPx } from "@/lib/printDimensions";
import type {
  AdminOrderLineInput,
  AdminOrderUpdateLineInput,
  MugLayoutData,
  NotebookLayoutData,
  PenLayoutData,
  ProductType,
} from "@/lib/validations";
import {
  AdminCustomerForm,
  EMPTY_CUSTOMER_VALUE,
  parseAdminCopiesInput,
  type CustomerFormValue,
} from "@/app/admin/_components/orderForms";
import { resolveR2Key, uploadFile } from "@/app/admin/_components/orderForms/uploadHelpers";
import { buildDesignFileName } from "@/lib/design/fileName";
import type { DesignListItemJson } from "@/lib/design/designJson";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import type { PenProductOption } from "@/app/pen/_components/PenProductPicker";
import { mugProductDisplayName } from "@/lib/mug/mugProductLabels";
import { notebookProductDisplayName } from "@/lib/notebook/notebookProductLabels";
import { penProductDisplayName } from "@/lib/pen/penProductLabels";
import { cn } from "@/lib/utils";
import { adminTableOutlineIconButtonClass } from "@/app/admin/_components/AdminTableIconActions";
import {
  CatalogSkuPickModal,
  type CatalogSkuPickModalKind,
} from "@/app/admin/_components/CatalogSkuPickModal";
import {
  AdminPaperRowFields,
  type SlotPaperPrint,
} from "@/app/admin/_components/AdminPaperRowFields";
import { getPdfPageCount } from "@/app/admin/_lib/pdfPageCount";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import {
  paperPrintFromStoredFile,
  wizardRowFilesForLine,
} from "./adminOrderWizardHydrate";
import {
  wizardLineKey,
  minimalUploadReadyMugLayout,
  minimalUploadReadyNotebookLayout,
  minimalUploadReadyPenLayout,
  applyMinimalLayoutJsonWhenNewUpload,
} from "./adminWizardLayoutPrepare";
import {
  computeLargeFormatLinePricing,
  roundMoneyMdl,
} from "@/lib/largeFormat/largeFormatLinePricing";
import {
  computeLfRollOrderEconomics,
  effectiveLfMaterialCostPerLinearMeterMdl,
  lfRollEconomicsWithRevenueMargin,
} from "@/lib/largeFormat/lfRollOrderEconomics";
import {
  computeLfInkSellPriceMdl,
  lfInkMarkupMultiplierUsed,
  mergeLfPricingWithInkSell,
  type LfMaterialPricingResult,
} from "@/lib/largeFormat/lfInkSellPricing";
import { applyLfMinimumLineSellTotalMdl } from "@/lib/largeFormat/lfMinimumLineSell";
import { applyLfSizePresetOverride } from "@/lib/largeFormat/lfPresetPricing";
import type { LfRollOrderEconomicsResult } from "@/lib/largeFormat/lfRollOrderEconomics";
import {
  LF_ROLL_PACK_MAX_QUANTITY,
  resolveEffectivePrintableWidthMeters,
} from "@/lib/largeFormat/largeFormatRollConstants";
import {
  computeLargeFormatRollLayout,
  type LargeFormatRollPackLayout,
} from "@/lib/largeFormat/largeFormatRollPack";
import { resolveGalleryWrapCm } from "@/lib/largeFormat/lfLayoutBorder";
import {
  packGroupTiles,
  GROUP_TILE_PACK_DEFAULT_GAP_CM,
  type GroupTilePackTile,
} from "@/lib/largeFormat/groupTilePack";
import type { AdminLargeFormatMaterialJson } from "@/lib/largeFormat/toAdminLargeFormatMaterialJson";
import type { WizardBootstrapData } from "@/lib/wizardBootstrap";
import {
  formatAmountMdl,
  parseAmountMdl,
  round2,
  sanitizeMoneyInput,
} from "@/lib/money";
import type { LargeFormatCustomerType } from "@/lib/largeFormat/types";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { LfRollPackPreview } from "@/app/admin/_components/LfRollPackPreview";
import { lfPieceFitsAcrossPrintableWidthCm } from "@/lib/largeFormat/lfPieceFitsPrintableWidthCm";
import { isSuperAdmin } from "@/lib/roles";
import { PageSkeleton } from "@/app/admin/_components/PageSkeleton";
import {
  parseSelectionValue,
  resolveFamilyPreviewMaterial,
  groupMaterialsForUi,
  selectionValueFromMaterialOrFamily,
  type MaterialOrFamily,
} from "@/lib/largeFormat/lfMaterialFamilyUi";
import { lfMaterialFamilyKey } from "@/lib/largeFormat/lfMaterialFamily";
import type { AdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";
import {
  BUSINESS_CARD_BACK_PAPER_TYPE,
  BUSINESS_CARD_DEFAULT_PRESET_ID,
  BUSINESS_CARD_FRONT_PAPER_TYPE,
  BUSINESS_CARD_MAX_SIDE_CM,
  BUSINESS_CARD_MIN_SIDE_CM,
  findBusinessCardPreset,
  layoutSizeFromTrim,
  snapQuantityToWholeSheets,
  type BusinessCardPresetId,
  type BusinessCardSides,
} from "@/lib/businessCard/businessCardConstants";
import {
  computeBusinessCardSheetLayout,
  sheetsForQuantity,
  type BusinessCardSheetLayout,
} from "@/lib/businessCard/businessCardSheetLayout";
import {
  applyBusinessCardMinimumLineTotal,
  computeBusinessCardLinePricing,
} from "@/lib/businessCard/businessCardLinePricing";
import {
  businessCardTrimSize,
  parseBusinessCardLineData,
} from "@/lib/businessCard/parseBusinessCardLineData";
import { AdminBusinessCardRowFields } from "@/app/admin/_components/AdminBusinessCardRowFields";

function lfAdminSkuResolvedMaterialId(
  lfMaterialId: string | null,
  items: AdminLargeFormatMaterialJson[],
): string {
  return lfMaterialId && items.some((m) => m.id === lfMaterialId)
    ? lfMaterialId
    : items[0]!.id;
}

/**
 * Concrete roll for layout preview / validation / catalog price when the
 * slot may be a family selection. Uses pickBillingRoll (min-sufficient)
 * once dimensions are known — never sticks on the narrowest representative.
 */
function lfAdminPreviewMaterial(
  a: Pick<
    SlotAssign,
    | "lfSelectionValue"
    | "lfMaterialId"
    | "lfPrintWidthCmStr"
    | "lfPrintHeightCmStr"
    | "copiesStr"
    | "lfCustomerType"
  >,
  items: AdminLargeFormatMaterialJson[],
): AdminLargeFormatMaterialJson | null {
  if (items.length === 0) return null;
  const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
  const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
  const q = parseAdminCopiesInput(a.copiesStr);
  const selectionValue =
    a.lfSelectionValue ??
    (a.lfMaterialId ? `material:${a.lfMaterialId}` : null);

  const resolved = resolveFamilyPreviewMaterial({
    selectionValue,
    materials: items,
    printWidthCm: Number.isFinite(w) && w > 0 ? w : null,
    printHeightCm: Number.isFinite(h) && h > 0 ? h : null,
    quantity: q,
    customerType: a.lfCustomerType,
  });
  if (resolved) return resolved;

  // Family selected but nothing fits yet — keep a representative so the
  // dropdown still shows; validation below treats fitsCross as false.
  const sel = parseSelectionValue(selectionValue);
  if (sel.type === "family" && sel.id) {
    const fallback = resolveFamilyPreviewMaterial({
      selectionValue,
      materials: items,
      printWidthCm: null,
      printHeightCm: null,
      quantity: 1,
      customerType: a.lfCustomerType,
    });
    if (fallback) return fallback;
  }

  const fallbackId = lfAdminSkuResolvedMaterialId(a.lfMaterialId, items);
  return items.find((m) => m.id === fallbackId) ?? items[0] ?? null;
}

/** Printable strip width across the roll (cm) for SKU pricing / validation. */
function lfSkuPrintableWidthCm(mat: AdminLargeFormatMaterialJson): number {
  return (
    resolveEffectivePrintableWidthMeters({
      printableWidthMeters: mat.printableWidthMeters,
      rollWidthMeters: mat.rollWidthMeters,
    }) * 100
  );
}

/** True when width/height are valid numerically but neither side fits printable width across the roll (rotation assumed). */
function lfSkuDimsExceedPrintable(
  mat: AdminLargeFormatMaterialJson,
  wStr: string,
  hStr: string,
): boolean {
  const w = parseFloat(wStr.replace(",", "."));
  const h = parseFloat(hStr.replace(",", "."));
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return false;
  return !lfPieceFitsAcrossPrintableWidthCm(w, h, lfSkuPrintableWidthCm(mat));
}

type WizardStep = "files" | "confirm";

/**
 * Client-side cap on wizard slots. Keep in sync with the server-side
 * `MAX_ORDER_LINES` in `adminOrderCreateHelpers.ts` — every file becomes its
 * own order line, so this is effectively the max positions per order.
 */
const MAX_WIZARD_SLOTS = 50;

const STEP_ORDER: WizardStep[] = ["files", "confirm"];

const PRODUCT_OPTIONS: {
  id: ProductType;
  labelKey: "paper" | "mug" | "nb" | "pen" | "lf" | "bc";
}[] = [
  { id: "paper_print", labelKey: "paper" },
  { id: "mug", labelKey: "mug" },
  { id: "notebook", labelKey: "nb" },
  { id: "pen", labelKey: "pen" },
  { id: "large_format_print", labelKey: "lf" },
  { id: "business_card", labelKey: "bc" },
];

/** Product types that pick a SKU from a catalog; others have no SKU modal. */
const CATALOG_SKU_KIND_BY_PRODUCT: Partial<
  Record<ProductType, CatalogSkuPickModalKind>
> = {
  mug: "mug",
  notebook: "notebook",
  pen: "pen",
};

interface NewOrderPageClientProps {
  /** Logged-in staff role (from server session) — drives LF pricing detail level. */
  staffRole: string;
  initialProduct: string | null;
  initialMode: string | null;
  fromInvoiceLineItemId?: string | null;
  initialClientId?: string | null;
  /** Comma-separated Design Studio ids from `?designs=` (RSC fallback). */
  initialDesigns?: string | null;
  /** When set, wizard hydrates from GET /api/admin/orders/:id and PATCHes on save. */
  editOrderId?: string | null;
  /**
   * Server-side bundle of catalog + economics data resolved by
   * {@link loadWizardBootstrap} during RSC render. Replaces the four
   * `useEffect` fetches we used to issue on mount, eliminating the
   * RSC → mount → fetch waterfall on `/admin/orders/new`.
   */
  bootstrap: WizardBootstrapData;
}

/** One table row: new upload and/or persisted server file + optional originating line id. */
export interface AdminWizardSlot {
  id: string;
  file?: File;
  existingFile?: {
    id: string;
    fileName: string;
    copies: number;
    color: string;
    paperType: string | null;
    pageCount: number | null;
  };
  /** Present when loaded from `order_lines`; groups rows on PATCH. */
  sourceOrderLineId: string | null;
}

type CatalogPick = { type: "catalog"; productId: string } | { type: "other" } | null;
type MugPick = CatalogPick;
type NbPick = CatalogPick;
type PenPick = CatalogPick;

interface SlotAssign {
  productType: ProductType;
  copiesStr: string;
  mugPick: MugPick;
  nbPick: NbPick;
  penPick: PenPick;
  /** Mug/notebook/pen: MDL per unit (× copies). Large format: optional full line total; empty = auto total. */
  linePriceStr: string;
  /** Set when `productType === "paper_print"`; cleared for every other row */
  paperPrint: SlotPaperPrint | null;
  /** Preserved layout JSON for mug/notebook/pen rows (esp. edit mode). */
  mugLayoutData?: MugLayoutData | null;
  notebookLayoutData?: NotebookLayoutData | null;
  penLayoutData?: PenLayoutData | null;
  /** DB JSON — used to resolve SKU selection after `/api/mug-products` loads. */
  mugProductSnapshot?: Record<string, unknown> | null;
  notebookProductSnapshot?: Record<string, unknown> | null;
  penProductSnapshot?: Record<string, unknown> | null;
  /** Legacy: concrete material ID (kept for backward compat / edit mode). */
  lfMaterialId: string | null;
  /**
   * Large format selection: either `material:<id>` or `family:<key>`.
   * When set, overrides `lfMaterialId` on submit.
   */
  lfSelectionValue: string | null;
  lfPrintWidthCmStr: string;
  lfPrintHeightCmStr: string;
  lfCustomerType: LargeFormatCustomerType;
  /** When non-null and material has presets, locks size + line total to this preset. */
  lfSizePresetId: string | null;
  /** Business cards: sheet paper the run is imposed on. */
  bcSheetPaperId: string | null;
  bcSides: BusinessCardSides;
  /** Finished size standard, or `"custom"` for the free-form pair below. */
  bcPresetId: BusinessCardPresetId;
  bcTrimWidthStr: string;
  bcTrimHeightStr: string;
  /**
   * Business cards: back-side artwork. A double-sided run is one order line
   * with two files, so the reverse lives on the assignment instead of taking
   * a second wizard slot (which would bill and impose it separately).
   */
  bcBackFile: File | null;
  /**
   * Edit mode: reverse artwork already stored on the order line. Kept apart
   * from `bcBackFile` so an untouched row can be saved by file id instead of
   * forcing the manager to upload the same artwork again.
   */
  bcBackExistingFile: { id: string; fileName: string } | null;
  /** Design Studio source, when the row was prefilled from a saved design. */
  designId: string | null;
}

function defaultPaperPrint(): SlotPaperPrint {
  return {
    color: "bw",
    paperType: "A4",
    customWidth: "",
    customHeight: "",
    pageCount: undefined,
  };
}

function firstCatalogPick(items: { id: string }[]): CatalogPick {
  return items.length > 0
    ? { type: "catalog", productId: items[0]!.id }
    : { type: "other" };
}

function defaultAssign(
  mugItems: MugProductOption[],
  nbItems: NotebookProductOption[],
  penItems: PenProductOption[],
  lfDefaultMaterialId: string | null,
  lfDefaultCustomerType: LargeFormatCustomerType = "retail",
  bcDefaultSheetPaperId: string | null = null,
): SlotAssign {
  return {
    productType: "paper_print",
    copiesStr: "1",
    linePriceStr: "",
    paperPrint: defaultPaperPrint(),
    mugPick: firstCatalogPick(mugItems),
    nbPick: firstCatalogPick(nbItems),
    penPick: firstCatalogPick(penItems),
    lfMaterialId: lfDefaultMaterialId,
    lfSelectionValue: lfDefaultMaterialId ? `material:${lfDefaultMaterialId}` : null,
    lfPrintWidthCmStr: "100",
    lfPrintHeightCmStr: "100",
    lfCustomerType: lfDefaultCustomerType,
    lfSizePresetId: null,
    bcSheetPaperId: bcDefaultSheetPaperId,
    bcSides: "one",
    bcPresetId: BUSINESS_CARD_DEFAULT_PRESET_ID,
    bcTrimWidthStr: "",
    bcTrimHeightStr: "",
    bcBackFile: null,
    bcBackExistingFile: null,
    designId: null,
  };
}

function newSlotId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function catalogRetailUnitMdl(
  a: SlotAssign,
  mugById: Map<string, MugProductOption>,
  nbById: Map<string, NotebookProductOption>,
  penById: Map<string, PenProductOption>,
): number | null {
  const pick =
    a.productType === "mug"
      ? a.mugPick
      : a.productType === "notebook"
        ? a.nbPick
        : a.productType === "pen"
          ? a.penPick
          : null;
  if (pick?.type !== "catalog") return null;

  const catalog =
    a.productType === "mug"
      ? mugById
      : a.productType === "notebook"
        ? nbById
        : penById;
  const price = catalog.get(pick.productId)?.sellPrice;
  if (price == null || !Number.isFinite(Number(price))) return null;
  return round2(Number(price));
}

/**
 * Parse a per-line price entry from the admin order wizard. Accepts a
 * decimal value (comma or dot) since `Order.price` migrated to
 * `Decimal(12, 2)` — `1.5` / `1,5` → `1.5`, blank → `null`. Returns
 * `null` for invalid / negative input so the wizard treats the line as
 * "no manual price".
 */
function parsedLinePriceMdl(s: string): number | null {
  return parseAmountMdl(s);
}

type LfWizardErrCopy = {
  lfPackDoesNotFit: string;
  lfPackQuantityTooLarge: (max: number) => string;
};

function formatLfAdminOrderSaveError(err: unknown, copy: LfWizardErrCopy): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "lf_pack_does_not_fit") return copy.lfPackDoesNotFit;
  if (msg === "lf_pack_quantity_too_large")
    return copy.lfPackQuantityTooLarge(LF_ROLL_PACK_MAX_QUANTITY);
  return msg || "Failed to save order";
}

function lfPricingFromSlotInputs(opts: {
  mat: AdminLargeFormatMaterialJson;
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  customerType: LargeFormatCustomerType;
  /** When set, locks line total to `unitPriceMdl × quantity` (preset wins over ink/min uplift). */
  sizePreset?: { unitPriceMdl: number } | null;
  /** When set, aligns wizard pricing/stock econ with persisted order/server (ink markup + margins). */
  printEconomics: null | {
    inkMlPerSqmLargeFormatRoll: number;
    avgInkCostPerMlMdl: number;
    lfInkRetailMarkupMultiplier: number;
    lfInkDealerMarkupMultiplier: number;
  };
  /** Production setting: bump line total to at least this (MDL, 0 = off). From print-economics / accounting. */
  lfMinimumLineTotalMdl: number;
}):
  | {
      ok: true;
      printableWidthCm: number;
      pricing: LfMaterialPricingResult;
      layout: LargeFormatRollPackLayout;
      rollEconomics: LfRollOrderEconomicsResult | null;
      inkSellPerSqmMdl: number;
      minimumLineUpliftMdl: number;
      lfMinimumLineFloorMdl: number | null;
    }
  | { ok: false; code: "does_not_fit" | "quantity_too_large" } {
  const printableM = resolveEffectivePrintableWidthMeters({
    printableWidthMeters: opts.mat.printableWidthMeters,
    rollWidthMeters: opts.mat.rollWidthMeters,
  });
  const printableWidthCm = printableM * 100;
  // Canvas adds a mirrored gallery-wrap margin (4 cm/side): price, packing and
  // ink economics use the wrapped size while the entered size is the face.
  const galleryWrapCm = resolveGalleryWrapCm(opts.mat.name);
  const effPrintWidthCm = opts.printWidthCm + 2 * galleryWrapCm;
  const effPrintHeightCm = opts.printHeightCm + 2 * galleryWrapCm;
  const pack = computeLargeFormatRollLayout({
    printableWidthCm,
    nominalRollWidthMeters: Number(opts.mat.rollWidthMeters),
    printWidthCm: effPrintWidthCm,
    printHeightCm: effPrintHeightCm,
    quantity: opts.quantity,
  });
  if (!pack.ok) return { ok: false, code: pack.code };
  const effCostLm = effectiveLfMaterialCostPerLinearMeterMdl({
    costPerLinearMeter: opts.mat.costPerLinearMeter,
    avgPurchaseCostPerLinearMeter: opts.mat.avgPurchaseCostPerLinearMeter,
  });
  const pricingMat = computeLargeFormatLinePricing({
    calculatedLinearMeters: pack.layout.calculatedLinearMeters,
    customerType: opts.customerType,
    material: {
      costPerLinearMeter: effCostLm,
      finalRetailPricePerLinearMeter: opts.mat.effectiveRetailPricePerLinearMeter ?? 0,
      finalDealerPricePerLinearMeter: opts.mat.effectiveDealerPricePerLinearMeter ?? 0,
      dealerPricePerLinearMeter: opts.mat.dealerPricePerLinearMeter,
      retailPricePerLinearMeter: opts.mat.retailPricePerLinearMeter,
      dealerPrintPricePerLinearMeter: opts.mat.dealerPrintPricePerLinearMeter,
      retailPrintPricePerLinearMeter: opts.mat.retailPrintPricePerLinearMeter,
    },
  });

  let pricing = pricingMat;
  let econCostsAfterInk: ReturnType<typeof computeLfRollOrderEconomics> | null = null;
  let rollEconomics: LfRollOrderEconomicsResult | null = null;
  let inkSellPerSqmMdl = 0;
  let minimumLineUpliftMdl = 0;
  let lfMinimumLineFloorMdl: number | null = null;

  const pe = opts.printEconomics;
  /** Compute ink COGS economics regardless of preset (for accounting/profit display). */
  if (
    pe &&
    Number.isFinite(pe.inkMlPerSqmLargeFormatRoll) &&
    pe.inkMlPerSqmLargeFormatRoll >= 0 &&
    Number.isFinite(pe.avgInkCostPerMlMdl) &&
    pe.avgInkCostPerMlMdl >= 0
  ) {
    const econCosts = computeLfRollOrderEconomics({
      printWidthCm: effPrintWidthCm,
      printHeightCm: effPrintHeightCm,
      quantity: opts.quantity,
      calculatedLinearMeters: pack.layout.calculatedLinearMeters,
      rollWidthMeters: Number(opts.mat.rollWidthMeters),
      effectiveMaterialCostPerLinearMeterMdl: effCostLm,
      inkMlPerSqm: pe.inkMlPerSqmLargeFormatRoll,
      avgInkCostPerMlMdl: pe.avgInkCostPerMlMdl,
      totalSellPriceMdl: pricingMat.materialSellPrice,
    });
    econCostsAfterInk = econCosts;

    if (opts.sizePreset && opts.sizePreset.unitPriceMdl > 0) {
      /** Preset wins: lock total = unit × qty, skip ink markup merge + min uplift. */
      pricing = applyLfSizePresetOverride({
        pricing: pricingMat,
        presetPriceMdl: opts.sizePreset.unitPriceMdl,
        quantity: opts.quantity,
        inkCostMdl: econCosts.inkCostMdl,
      });
    } else {
      const inkMarkupSlice = {
        lfInkRetailMarkupMultiplier: Number.isFinite(pe.lfInkRetailMarkupMultiplier)
          ? Math.max(0, pe.lfInkRetailMarkupMultiplier)
          : 0,
        lfInkDealerMarkupMultiplier: Number.isFinite(pe.lfInkDealerMarkupMultiplier)
          ? Math.max(0, pe.lfInkDealerMarkupMultiplier)
          : 0,
      };
      const inkSell = computeLfInkSellPriceMdl(
        econCosts.inkCostMdl,
        opts.customerType,
        inkMarkupSlice,
      );
      pricing = mergeLfPricingWithInkSell(pricingMat, inkSell);
      inkSellPerSqmMdl =
        econCosts.usefulAreaSqm > 1e-9 ? roundMoneyMdl(inkSell / econCosts.usefulAreaSqm) : 0;
    }
  } else if (opts.sizePreset && opts.sizePreset.unitPriceMdl > 0) {
    /** Preset without ink economics: still lock total. */
    pricing = applyLfSizePresetOverride({
      pricing: pricingMat,
      presetPriceMdl: opts.sizePreset.unitPriceMdl,
      quantity: opts.quantity,
    });
  }

  /** Minimum line uplift only applies when no preset is locked. */
  if (!opts.sizePreset || !(opts.sizePreset.unitPriceMdl > 0)) {
    // Dealers are exempt from the per-line minimum total (best price), mirroring
    // the server core `resolveLargeFormatLine`. Retail keeps the floor.
    const minFloor =
      opts.customerType !== "dealer" &&
      Number.isFinite(opts.lfMinimumLineTotalMdl) &&
      opts.lfMinimumLineTotalMdl > 0
        ? Math.round(opts.lfMinimumLineTotalMdl)
        : 0;
    const { pricing: pricingAfterMin, upliftMdl } =
      applyLfMinimumLineSellTotalMdl(pricing, minFloor);

    pricing = pricingAfterMin;
    minimumLineUpliftMdl = upliftMdl;
    lfMinimumLineFloorMdl = upliftMdl > 0 && minFloor > 0 ? minFloor : null;
  }

  if (econCostsAfterInk !== null) {
    rollEconomics = lfRollEconomicsWithRevenueMargin(
      econCostsAfterInk,
      pricing.totalSellPrice,
    );
  }

  return {
    ok: true,
    printableWidthCm,
    pricing,
    layout: pack.layout,
    rollEconomics,
    inkSellPerSqmMdl,
    minimumLineUpliftMdl,
    lfMinimumLineFloorMdl,
  };
}

/**
 * Locate the active preset for a slot and return its per-piece price for the
 * chosen customer type. Returns null when no preset is selected or it is not
 * usable (deleted / inactive / wrong material).
 */
function lfActivePresetForSlot(
  a: SlotAssign,
  lfById: Map<string, AdminLargeFormatMaterialJson>,
): null | { unitPriceMdl: number; widthCm: number; heightCm: number; presetId: string } {
  if (!a.lfMaterialId || !a.lfSizePresetId) return null;
  const m = lfById.get(a.lfMaterialId);
  const list = m?.sizePresets ?? [];
  const found = list.find((p) => p.id === a.lfSizePresetId && p.isActive);
  if (!found) return null;
  const unit = a.lfCustomerType === "dealer" ? found.dealerPriceMdl : found.retailPriceMdl;
  return {
    unitPriceMdl: Math.max(0, Math.round(unit)),
    widthCm: found.widthCm,
    heightCm: found.heightCm,
    presetId: found.id,
  };
}

function lfComputedLineTotalMdl(
  a: SlotAssign,
  lfById: Map<string, AdminLargeFormatMaterialJson>,
  lfItems: AdminLargeFormatMaterialJson[],
  lfPrintEconomics: Parameters<typeof lfPricingFromSlotInputs>[0]["printEconomics"],
  lfMinimumLineTotalMdl: number,
): number {
  if (a.productType !== "large_format_print") return 0;
  if (!a.lfMaterialId && !a.lfSelectionValue) return 0;
  const m = lfAdminPreviewMaterial(a, lfItems);
  if (!m) return 0;
  const q = parseAdminCopiesInput(a.copiesStr);
  if (q === null || q < 1) return 0;
  const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
  const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return 0;
  // Use billing roll id for preset lookup when family-resolved.
  const aForPreset = { ...a, lfMaterialId: m.id };
  const preset = lfActivePresetForSlot(aForPreset, lfById);
  const lf = lfPricingFromSlotInputs({
    mat: m,
    printWidthCm: w,
    printHeightCm: h,
    quantity: q,
    customerType: a.lfCustomerType,
    sizePreset: preset ? { unitPriceMdl: preset.unitPriceMdl } : null,
    printEconomics: lfPrintEconomics,
    lfMinimumLineTotalMdl,
  });
  if (!lf.ok) return 0;
  return lf.pricing.totalSellPrice;
}

/** Finished card size the row describes, or null while the custom pair is blank. */
function bcAssignTrimSize(
  a: SlotAssign,
): { trimWidthCm: number; trimHeightCm: number } | null {
  const preset = findBusinessCardPreset(a.bcPresetId);
  if (preset) {
    return {
      trimWidthCm: preset.trimWidthCm,
      trimHeightCm: preset.trimHeightCm,
    };
  }
  const trimWidthCm = Number.parseFloat(a.bcTrimWidthStr.replace(",", "."));
  const trimHeightCm = Number.parseFloat(a.bcTrimHeightStr.replace(",", "."));
  const inRange = (cm: number): boolean =>
    Number.isFinite(cm) &&
    cm >= BUSINESS_CARD_MIN_SIDE_CM &&
    cm <= BUSINESS_CARD_MAX_SIDE_CM;
  if (!inRange(trimWidthCm) || !inRange(trimHeightCm)) return null;
  return { trimWidthCm, trimHeightCm };
}

/**
 * Sheet geometry of a business-card row: the imposition, the run rounded up to
 * whole sheets and the sheets it consumes. Returns `null` when the row is not
 * yet resolvable (no paper, bad run size, or the card does not fit the sheet).
 */
function bcSlotGeometry(
  a: SlotAssign,
  paperById: Map<string, AdminSheetPaperJson>,
): {
  paper: AdminSheetPaperJson;
  trim: { trimWidthCm: number; trimHeightCm: number };
  layout: BusinessCardSheetLayout;
  /** Run after rounding up to fill whole sheets. */
  quantity: number;
  sheetsUsed: number;
} | null {
  if (a.productType !== "business_card") return null;
  const paper = a.bcSheetPaperId ? paperById.get(a.bcSheetPaperId) : undefined;
  if (!paper) return null;

  const trim = bcAssignTrimSize(a);
  if (!trim) return null;

  const typedQuantity = parseAdminCopiesInput(a.copiesStr);
  if (typedQuantity === null || typedQuantity < 1) return null;

  const layout = computeBusinessCardSheetLayout({
    sheetWidthCm: paper.sheetWidthCm,
    sheetHeightCm: paper.sheetHeightCm,
    ...layoutSizeFromTrim(trim.trimWidthCm, trim.trimHeightCm),
  });
  if (layout.cardsPerSheet === 0) return null;

  const quantity = snapQuantityToWholeSheets(
    typedQuantity,
    layout.cardsPerSheet,
  );
  return {
    paper,
    trim,
    layout,
    quantity,
    sheetsUsed: sheetsForQuantity(quantity, layout.cardsPerSheet),
  };
}

/**
 * Local mirror of the server business-card resolver, so the wizard shows the
 * same line total it will be charged. Returns `null` when the row is not yet
 * priceable (no paper, bad run size, or the card does not fit the sheet).
 */
function bcSlotPricing(
  a: SlotAssign,
  paperById: Map<string, AdminSheetPaperJson>,
  bcMinimumLineTotalMdl: number,
): {
  layout: BusinessCardSheetLayout;
  sheetsUsed: number;
  cardsPerSheet: number;
  pricePerSheetMdl: number;
  totalSellPriceMdl: number;
  /** Run after rounding up to fill whole sheets. */
  quantity: number;
} | null {
  const geo = bcSlotGeometry(a, paperById);
  if (!geo) return null;
  const { paper, layout, quantity, sheetsUsed } = geo;

  const base = computeBusinessCardLinePricing({
    paperSnapshot: {
      id: paper.id,
      name: paper.name,
      sheetWidthCm: paper.sheetWidthCm,
      sheetHeightCm: paper.sheetHeightCm,
      costPerSheet: paper.costPerSheet,
      retailPricePerSheet: paper.retailPricePerSheet,
      dealerPricePerSheet: paper.dealerPricePerSheet,
    },
    avgPaperCostPerSheet: paper.avgPurchaseCostPerSheet,
    sheetsUsed,
    sides: a.bcSides,
    customerType: a.lfCustomerType,
  });
  const { pricing } = applyBusinessCardMinimumLineTotal(
    base,
    bcMinimumLineTotalMdl,
  );

  return {
    layout,
    sheetsUsed,
    cardsPerSheet: layout.cardsPerSheet,
    quantity,
    pricePerSheetMdl: pricing.pricePerSheetMdl,
    totalSellPriceMdl: pricing.totalSellPriceMdl,
  };
}

function effectiveLineTotalMdl(
  a: SlotAssign,
  mugById: Map<string, MugProductOption>,
  nbById: Map<string, NotebookProductOption>,
  penById: Map<string, PenProductOption>,
  lfById: Map<string, AdminLargeFormatMaterialJson>,
  lfItems: AdminLargeFormatMaterialJson[],
  lfPrintEconomics: Parameters<typeof lfPricingFromSlotInputs>[0]["printEconomics"],
  lfMinimumLineTotalMdl: number,
  bcPaperById: Map<string, AdminSheetPaperJson>,
  bcMinimumLineTotalMdl: number,
): number {
  if (a.productType === "large_format_print") {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    return lfComputedLineTotalMdl(a, lfById, lfItems, lfPrintEconomics, lfMinimumLineTotalMdl);
  }
  if (a.productType === "business_card") {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    return bcSlotPricing(a, bcPaperById, bcMinimumLineTotalMdl)?.totalSellPriceMdl ?? 0;
  }
  const cop = parseAdminCopiesInput(a.copiesStr);
  const copN = cop === null ? 0 : cop;
  const parsedUnit = parsedLinePriceMdl(a.linePriceStr);
  const catalogUnit = catalogRetailUnitMdl(a, mugById, nbById, penById);
  const unit = parsedUnit ?? catalogUnit;
  if (unit === null) return 0;
  return round2(Number(unit) * copN);
}

function resolvedPaperStorageValue(pp: SlotPaperPrint): string {
  return pp.paperType === "other" &&
    pp.customWidth.trim() &&
    pp.customHeight.trim()
    ? `other:${pp.customWidth.trim()}x${pp.customHeight.trim()}`
    : pp.paperType;
}

function parseLayoutJson<T>(raw: unknown): T | undefined {
  if (raw && typeof raw === "object") return raw as T;
  return undefined;
}

/** Measure persisted layout image vs current catalog print size (e.g. after product type change). */
async function validateLayoutFromExistingServerFile(
  fileId: string,
  expected: { width: number; height: number },
): Promise<SizeValidationResult> {
  const fallback: SizeValidationResult = {
    ok: false,
    expected,
    actual: { width: 0, height: 0 },
    tolerance: 0.02,
  };
  try {
    const res = await fetch(`/api/download/${fileId}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return fallback;
    const blob = await res.blob();
    const actual = await getImageDimensions(blob);
    return validateLayoutSize(actual, expected);
  } catch {
    return fallback;
  }
}

const CATALOG_SKU_KINDS = ["mug", "notebook", "pen"] as const;

/**
 * Print-area the uploaded layout must match, in pixels, for the catalog SKU
 * currently picked on the row. `null` when the row is on «Other» or the SKU is
 * not in the bundled catalog — neither case has a size to check against.
 */
function expectedLayoutPx(
  a: SlotAssign,
  kind: CatalogSkuPickModalKind,
  mugById: Map<string, MugProductOption>,
  nbById: Map<string, NotebookProductOption>,
  penById: Map<string, PenProductOption>,
): { width: number; height: number } | null {
  const pick =
    kind === "mug" ? a.mugPick : kind === "notebook" ? a.nbPick : a.penPick;
  if (pick?.type !== "catalog") return null;

  const catalog =
    kind === "mug" ? mugById : kind === "notebook" ? nbById : penById;
  const p = catalog.get(pick.productId);
  if (!p) return null;
  return {
    width: cmToPx(Number(p.printWidthCm), p.printDpi),
    height: cmToPx(Number(p.printHeightCm), p.printDpi),
  };
}

/** Measures whichever image the row currently holds — new upload or stored file. */
async function measureSlotLayout(
  slot: AdminWizardSlot,
  expected: { width: number; height: number },
): Promise<SizeValidationResult | null> {
  if (slot.file) {
    try {
      return validateLayoutSize(await getImageDimensions(slot.file), expected);
    } catch {
      return {
        ok: false,
        expected,
        actual: { width: 0, height: 0 },
        tolerance: 0.02,
      };
    }
  }
  if (slot.existingFile) {
    return validateLayoutFromExistingServerFile(slot.existingFile.id, expected);
  }
  return null;
}

async function buildAdminOrderUpdateLines(
  slots: AdminWizardSlot[],
  assignBySlot: Record<string, SlotAssign>,
  bcPaperById: Map<string, AdminSheetPaperJson>,
  onFileStatus?: (slotId: string, status: "uploading" | "done") => void,
): Promise<AdminOrderUpdateLineInput[]> {
  const out: AdminOrderUpdateLineInput[] = [];
  let i = 0;
  while (i < slots.length) {
    const s0 = slots[i]!;
    const group: AdminWizardSlot[] = [s0];
    const lid = s0.sourceOrderLineId;
    i++;
    if (lid != null) {
      while (i < slots.length && slots[i]!.sourceOrderLineId === lid) {
        group.push(slots[i]!);
        i++;
      }
    }

    const baseAssign = assignBySlot[group[0]!.id];
    if (!baseAssign) throw new Error("Missing row config");

    const files: AdminOrderUpdateLineInput["files"] = [];
    for (const slot of group) {
      const a = assignBySlot[slot.id];
      if (!a) throw new Error("Missing row config");

      if (a.productType === "business_card") {
        // A double-sided run is one line carrying both faces: they are imposed
        // on the same sheet, so splitting them would bill two separate runs.
        // Per-file `copies` stays 1 — the run size lives on the line itself.
        // Untagged legacy files get their side tag written on first save, which
        // pins the face order the editor just showed.
        if (slot.file) {
          onFileStatus?.(slot.id, "uploading");
          const front = await uploadFile(slot.file);
          onFileStatus?.(slot.id, "done");
          files.push({
            fileName: front.fileName,
            fileUrl: front.fileUrl,
            copies: 1,
            color: "color",
            paperType: BUSINESS_CARD_FRONT_PAPER_TYPE,
          });
        } else if (slot.existingFile) {
          files.push({
            fileId: slot.existingFile.id,
            copies: 1,
            paperType: BUSINESS_CARD_FRONT_PAPER_TYPE,
          });
        } else {
          throw new Error("Each row needs a file");
        }

        if (a.bcSides === "two") {
          if (a.bcBackFile) {
            const back = await uploadFile(a.bcBackFile);
            files.push({
              fileName: back.fileName,
              fileUrl: back.fileUrl,
              copies: 1,
              color: "color",
              paperType: BUSINESS_CARD_BACK_PAPER_TYPE,
            });
          } else if (a.bcBackExistingFile) {
            files.push({
              fileId: a.bcBackExistingFile.id,
              copies: 1,
              paperType: BUSINESS_CARD_BACK_PAPER_TYPE,
            });
          } else {
            throw new Error("Back artwork required");
          }
        }
        continue;
      }

      if (slot.file) {
        onFileStatus?.(slot.id, "uploading");
        const { fileName, fileUrl } = await uploadFile(slot.file);
        onFileStatus?.(slot.id, "done");
        if (a.productType === "paper_print") {
          const paperCopies = parseAdminCopiesInput(a.copiesStr);
          if (paperCopies === null) throw new Error("Invalid copies");
          const pp = a.paperPrint;
          if (!pp) throw new Error("Paper options missing");
          files.push({
            fileName,
            fileUrl,
            copies: paperCopies,
            color: pp.color,
            paperType: resolvedPaperStorageValue(pp),
            pageCount: pp.pageCount,
          });
        } else if (a.productType === "large_format_print") {
          const lfCopies = parseAdminCopiesInput(a.copiesStr);
          if (lfCopies === null) throw new Error("Invalid copies");
          files.push({
            fileName,
            fileUrl,
            copies: lfCopies,
            color: "color",
            paperType: "large_format",
          });
        } else if (
          a.productType === "mug" ||
          a.productType === "notebook" ||
          a.productType === "pen"
        ) {
          const copies = parseAdminCopiesInput(a.copiesStr);
          if (copies === null) throw new Error("Invalid copies");
          files.push({ fileName, fileUrl, copies, color: "color" });
        } else {
          throw new Error("Unknown product");
        }
      } else if (slot.existingFile) {
        const copies = parseAdminCopiesInput(a.copiesStr);
        if (copies === null) throw new Error("Invalid copies");
        if (a.productType === "paper_print" && a.paperPrint) {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: a.paperPrint.color,
            paperType: resolvedPaperStorageValue(a.paperPrint),
            pageCount: a.paperPrint.pageCount,
          });
        } else if (a.productType === "large_format_print") {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: "color",
            paperType: "large_format",
          });
        } else if (
          a.productType === "mug" ||
          a.productType === "notebook" ||
          a.productType === "pen"
        ) {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: "color",
          });
        } else {
          throw new Error("Unknown product");
        }
      } else {
        throw new Error("Each row needs a file");
      }
    }

    const orderLineId =
      lid != null && group.every((g) => g.sourceOrderLineId === lid)
        ? lid
        : undefined;

    const bcGeometry =
      baseAssign.productType === "business_card"
        ? bcSlotGeometry(baseAssign, bcPaperById)
        : null;
    if (baseAssign.productType === "business_card" && !bcGeometry) {
      throw new Error("Invalid business card line");
    }

    out.push({
      orderLineId,
      productType: baseAssign.productType,
      mugLayoutData:
        baseAssign.productType === "mug"
          ? baseAssign.mugLayoutData ?? undefined
          : undefined,
      mugProductId:
        baseAssign.productType === "mug" &&
        baseAssign.mugPick?.type === "catalog"
          ? baseAssign.mugPick.productId
          : undefined,
      mugOther:
        baseAssign.productType === "mug" &&
        baseAssign.mugPick?.type === "other",
      notebookLayoutData:
        baseAssign.productType === "notebook"
          ? baseAssign.notebookLayoutData ?? undefined
          : undefined,
      notebookProductId:
        baseAssign.productType === "notebook" &&
        baseAssign.nbPick?.type === "catalog"
          ? baseAssign.nbPick.productId
          : undefined,
      notebookOther:
        baseAssign.productType === "notebook" &&
        baseAssign.nbPick?.type === "other",
      penLayoutData:
        baseAssign.productType === "pen"
          ? baseAssign.penLayoutData ?? undefined
          : undefined,
      penProductId:
        baseAssign.productType === "pen" &&
        baseAssign.penPick?.type === "catalog"
          ? baseAssign.penPick.productId
          : undefined,
      penOther:
        baseAssign.productType === "pen" &&
        baseAssign.penPick?.type === "other",
      largeFormatMaterialId:
        baseAssign.productType === "large_format_print"
          ? baseAssign.lfMaterialId ?? undefined
          : undefined,
      printWidthCm:
        baseAssign.productType === "large_format_print"
          ? parseFloat(baseAssign.lfPrintWidthCmStr.replace(",", "."))
          : undefined,
      printHeightCm:
        baseAssign.productType === "large_format_print"
          ? parseFloat(baseAssign.lfPrintHeightCmStr.replace(",", "."))
          : undefined,
      quantity:
        baseAssign.productType === "large_format_print"
          ? (parseAdminCopiesInput(baseAssign.copiesStr) ?? undefined)
          : baseAssign.productType === "business_card"
            ? // Send the run the row has been pricing: rounded up to whole
              // sheets, or the server rejects it as a partial sheet.
              (bcGeometry?.quantity ?? undefined)
            : undefined,
      customerType:
        baseAssign.productType === "large_format_print" ||
        baseAssign.productType === "business_card"
          ? baseAssign.lfCustomerType
          : undefined,
      lfSizePresetId:
        baseAssign.productType === "large_format_print"
          ? baseAssign.lfSizePresetId
          : undefined,
      sheetPaperId:
        baseAssign.productType === "business_card"
          ? (baseAssign.bcSheetPaperId ?? undefined)
          : undefined,
      cardSides:
        baseAssign.productType === "business_card"
          ? baseAssign.bcSides
          : undefined,
      cardPresetId:
        baseAssign.productType === "business_card"
          ? baseAssign.bcPresetId
          : undefined,
      cardTrimWidthCm:
        baseAssign.productType === "business_card"
          ? bcGeometry?.trim.trimWidthCm
          : undefined,
      cardTrimHeightCm:
        baseAssign.productType === "business_card"
          ? bcGeometry?.trim.trimHeightCm
          : undefined,
      designId: baseAssign.designId ?? undefined,
      files,
    });
  }
  return out;
}

function CatalogSkuThumb({
  imageUrl,
  fallbackColor,
  title,
}: {
  imageUrl: string | null;
  fallbackColor: string;
  title?: string;
}) {
  return (
    <div
      className="size-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
      title={title}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic catalog URLs
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="size-full object-contain p-0.5"
        />
      ) : (
        <div
          className="size-full"
          style={{ backgroundColor: fallbackColor }}
          aria-hidden
        />
      )}
    </div>
  );
}

function NewOrderWizard(props: NewOrderPageClientProps) {
  const {
    staffRole,
    fromInvoiceLineItemId = null,
    initialClientId = null,
    initialDesigns = null,
    editOrderId = null,
    bootstrap,
  } = props;
  const lfBreakdownFullDetail = isSuperAdmin(staffRole);
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusOrderLineParam = searchParams.get("line");
  /**
   * Where "cancel" and post-save navigation go. `?returnTo=` lets callers
   * (e.g. the admin client card) bring the user back to where they came
   * from; restricted to /admin/ paths so the param cannot redirect outside.
   */
  const returnToParam = searchParams.get("returnTo");
  const backHref =
    returnToParam && returnToParam.startsWith("/admin/")
      ? returnToParam
      : "/admin/orders";
  const { t, locale } = useLanguageStore();
  const { createAdminOrder } = useOrdersStore();

  const [step, setStep] = useState<WizardStep>("files");
  const [slots, setSlots] = useState<AdminWizardSlot[]>(() =>
    editOrderId ? [] : [{ id: newSlotId(), sourceOrderLineId: null }],
  );
  const [assignBySlot, setAssignBySlot] = useState<Record<string, SlotAssign>>({});
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const [catalogSkuModalSlotId, setCatalogSkuModalSlotId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate =
      slots.length > 0 &&
      selectedSlots.size > 0 &&
      selectedSlots.size < slots.length;
  }, [slots.length, selectedSlots.size]);
  const [bulkProduct, setBulkProduct] = useState<ProductType>("paper_print");
  const [fileDragActive, setFileDragActive] = useState(false);

  useEffect(() => {
    if (step !== "files") setCatalogSkuModalSlotId(null);
  }, [step]);

  const [customer, setCustomer] = useState<CustomerFormValue>(EMPTY_CUSTOMER_VALUE);

  const mugProductItems = bootstrap.mugProducts;
  const notebookProductItems = bootstrap.notebookProducts;
  const penProductItems = bootstrap.penProducts;
  const lfMaterialItems = bootstrap.lfMaterials;

  // Group materials by family for UI (ORACAL MATT shown as single option).
  const lfMaterialOptions = useMemo(() => {
    return groupMaterialsForUi(lfMaterialItems).map((item: MaterialOrFamily) => {
      const displayName = item.type === "family" ? item.displayName : item.material.name;
      const materialId = item.type === "family" ? item.representative.id : item.material.id;
      const selectionValue = selectionValueFromMaterialOrFamily(item);
      return {
        value: selectionValue,
        label: displayName,
        materialId,
      };
    });
  }, [lfMaterialItems]);

  const mugProductItemsRef = useRef<MugProductOption[]>(mugProductItems);
  const notebookProductItemsRef = useRef<NotebookProductOption[]>(
    notebookProductItems,
  );
  const penProductItemsRef = useRef<PenProductOption[]>(penProductItems);
  mugProductItemsRef.current = mugProductItems;
  notebookProductItemsRef.current = notebookProductItems;
  penProductItemsRef.current = penProductItems;
  const lfMaterialItemsRef = useRef<AdminLargeFormatMaterialJson[]>(lfMaterialItems);
  lfMaterialItemsRef.current = lfMaterialItems;
  // Ref-mirror of the order-level tier for use inside effects that we do NOT
  // want to re-run on tier change (e.g. one-shot design-URL hydration). The
  // dedicated mirror effect above normalizes all slots when the tier flips,
  // so a stale read here is harmless.
  const customerTypeRef = useRef(customer.customerType);
  customerTypeRef.current = customer.customerType;

  const bcDefaultSheetPaperIdRef = useRef<string | null>(
    bootstrap.sheetPapers[0]?.id ?? null,
  );
  bcDefaultSheetPaperIdRef.current = bootstrap.sheetPapers[0]?.id ?? null;

  // Keep lfMaterialId aligned with min-sufficient billing roll when a family
  // is selected and dimensions are known (preview / validation / price).
  const lfFamilyBillingSyncKey = useMemo(() => {
    return Object.entries(assignBySlot)
      .filter(([, a]) => a.productType === "large_format_print")
      .map(
        ([id, a]) =>
          `${id}|${a.lfSelectionValue ?? ""}|${a.lfPrintWidthCmStr}|${a.lfPrintHeightCmStr}|${a.copiesStr}|${a.lfMaterialId ?? ""}`,
      )
      .join(";");
  }, [assignBySlot]);

  useEffect(() => {
    setAssignBySlot((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [slotId, a] of Object.entries(prev)) {
        if (a.productType !== "large_format_print") continue;
        const sel = parseSelectionValue(
          a.lfSelectionValue ??
            (a.lfMaterialId ? `material:${a.lfMaterialId}` : null),
        );
        if (sel.type !== "family") continue;
        const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
        const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
        const q = parseAdminCopiesInput(a.copiesStr);
        if (
          !Number.isFinite(w) ||
          w <= 0 ||
          !Number.isFinite(h) ||
          h <= 0 ||
          q === null
        ) {
          continue;
        }
        const billing = resolveFamilyPreviewMaterial({
          selectionValue: a.lfSelectionValue,
          materials: lfMaterialItemsRef.current,
          printWidthCm: w,
          printHeightCm: h,
          quantity: q,
          customerType: a.lfCustomerType,
        });
        if (billing && billing.id !== a.lfMaterialId) {
          next[slotId] = { ...a, lfMaterialId: billing.id };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed via lfFamilyBillingSyncKey
  }, [lfFamilyBillingSyncKey]);

  const printEconomics: WizardBootstrapData["printEconomics"] | null =
    bootstrap.printEconomics;

  const bcPaperItems = bootstrap.sheetPapers;
  const bcDefaultSheetPaperId = bcPaperItems[0]?.id ?? null;

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [designsHydrating, setDesignsHydrating] = useState(false);
  // Per-file upload progress shown on the confirm step while submitting a NEW
  // order. `uploadPhase` drives whether we render the file checklist
  // ("uploading") or the "creating order" state. `uploadStatuses` is keyed by
  // slot id (one file per slot in the create wizard).
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "uploading" | "creating"
  >("idle");
  const [uploadStatuses, setUploadStatuses] = useState<
    Record<string, "pending" | "uploading" | "done" | "error">
  >({});
  const [editLoading, setEditLoading] = useState(Boolean(editOrderId));
  const [editLoadError, setEditLoadError] = useState("");
  /**
   * Set only in edit mode when we detect a legacy order with mixed LF
   * customer tiers. Holds the normalized tier ("retail"|"dealer") so the
   * banner can render the correct localized label. Null = no banner.
   */
  const [mixedTierBanner, setMixedTierBanner] = useState<
    LargeFormatCustomerType | null
  >(null);
  const [mugUploadOk, setMugUploadOk] = useState<
    Record<string, SizeValidationResult | null>
  >({});
  const [nbUploadOk, setNbUploadOk] = useState<
    Record<string, SizeValidationResult | null>
  >({});
  const [penUploadOk, setPenUploadOk] = useState<
    Record<string, SizeValidationResult | null>
  >({});

  useEffect(() => {
    if (editOrderId) return;
    if (!initialClientId) return;
    let cancelled = false;
    fetch(`/api/admin/clients/${initialClientId}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const c = (await res.json()) as {
          id: string;
          kind: string;
          phone: string | null;
          personName: string | null;
          companyName: string | null;
          companyIdno: string | null;
          isDealer: boolean;
        };
        setCustomer((prev) => {
          if (prev.selectedClient?.id === c.id) return prev;
          const nm =
            c.kind === "LEGAL"
              ? c.companyName && c.personName
                ? `${c.companyName} — ${c.personName}`
                : c.companyName || c.personName || ""
              : c.personName || "";
          return {
            ...prev,
            selectedClient: c,
            phone: c.phone ?? prev.phone,
            clientName: nm || prev.clientName,
            customerType: c.isDealer ? "dealer" : "retail",
          };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialClientId, editOrderId]);

  useEffect(() => {
    if (!editOrderId) {
      setEditLoading(false);
      setEditLoadError("");
      return;
    }

    let cancelled = false;
    setEditLoading(true);
    setEditLoadError("");

    fetch(`/api/admin/orders/${editOrderId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || res.statusText);
        }
        return res.json() as Promise<{
          phone: string;
          clientName: string | null;
          clientId: string | null;
          notes: string | null;
          price: number | null;
          studioClient: CustomerFormValue["selectedClient"];
          orderLines: Array<{
            id: string;
            sortOrder: number;
            productType: string;
            mugProductId: string | null;
            notebookProductId: string | null;
            penProductId: string | null;
            largeFormatMaterialId?: string | null;
            largeFormatLineData?: unknown;
            sheetPaperId?: string | null;
            businessCardLineData?: unknown;
            mugProductSnapshot?: unknown;
            notebookProductSnapshot?: unknown;
            penProductSnapshot?: unknown;
            mugLayoutData: unknown;
            notebookLayoutData: unknown;
            penLayoutData?: unknown;
            files: Array<{
              id: string;
              fileName: string;
              copies: number;
              color: string;
              paperType: string | null;
              pageCount: number | null;
            }>;
          }>;
        }>;
      })
      .then((order) => {
        if (cancelled) return;
        if (!order.orderLines?.length) {
          setEditLoadError("Order has no lines to edit");
          setEditLoading(false);
          return;
        }

        const mugs = mugProductItemsRef.current;
        const nbs = notebookProductItemsRef.current;
        const pens = penProductItemsRef.current;

        const lines = [...order.orderLines].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        const nextSlots: AdminWizardSlot[] = [];
        const nextAssign: Record<string, SlotAssign> = {};

        for (const line of lines) {
          const { rowFiles, businessCardBack } = wizardRowFilesForLine(
            line.productType,
            [...line.files].sort((a, b) =>
              a.fileName.localeCompare(b.fileName),
            ),
          );
          for (const f of rowFiles) {
            const sid = newSlotId();
            nextSlots.push({
              id: sid,
              existingFile: {
                id: f.id,
                fileName: f.fileName,
                copies: f.copies,
                color: f.color,
                paperType: f.paperType,
                pageCount: f.pageCount,
              },
              sourceOrderLineId: line.id,
            });
            const base = defaultAssign(
              mugs,
              nbs,
              pens,
              lfMaterialItemsRef.current[0]?.id ?? null,
              "retail",
              bcDefaultSheetPaperIdRef.current,
            );
            const pt = line.productType as ProductType;
            base.productType = pt;
            base.copiesStr = String(f.copies);
            base.linePriceStr = "";
            if (pt === "paper_print") {
              base.paperPrint = paperPrintFromStoredFile(f);
            } else {
              base.paperPrint = null;
            }
            if (pt === "mug") {
              base.mugPick =
                line.mugProductId != null
                  ? { type: "catalog", productId: line.mugProductId }
                  : { type: "other" };
              base.mugLayoutData =
                parseLayoutJson<MugLayoutData>(line.mugLayoutData) ?? undefined;
              base.mugProductSnapshot =
                line.mugProductSnapshot != null &&
                typeof line.mugProductSnapshot === "object"
                  ? (line.mugProductSnapshot as Record<string, unknown>)
                  : null;
            }
            if (pt === "notebook") {
              base.nbPick =
                line.notebookProductId != null
                  ? { type: "catalog", productId: line.notebookProductId }
                  : { type: "other" };
              base.notebookLayoutData =
                parseLayoutJson<NotebookLayoutData>(
                  line.notebookLayoutData,
                ) ?? undefined;
              base.notebookProductSnapshot =
                line.notebookProductSnapshot != null &&
                typeof line.notebookProductSnapshot === "object"
                  ? (line.notebookProductSnapshot as Record<string, unknown>)
                  : null;
            }
            if (pt === "pen") {
              base.penPick =
                line.penProductId != null
                  ? { type: "catalog", productId: line.penProductId }
                  : { type: "other" };
              base.penLayoutData =
                parseLayoutJson<PenLayoutData>(line.penLayoutData) ?? undefined;
              base.penProductSnapshot =
                line.penProductSnapshot != null &&
                typeof line.penProductSnapshot === "object"
                  ? (line.penProductSnapshot as Record<string, unknown>)
                  : null;
            }
            if (pt === "large_format_print") {
              const lfd = parseLargeFormatLineData(line.largeFormatLineData);
              base.lfMaterialId =
                line.largeFormatMaterialId ?? lfd?.materialSnapshot.id ?? null;
              // Populate selection value from lineData or fall back to materialId.
              if (lfd?.materialFamilyKey && lfd?.pricingPolicy === "min_sufficient_width") {
                base.lfSelectionValue = `family:${lfd.materialFamilyKey}`;
              } else if (base.lfMaterialId) {
                base.lfSelectionValue = `material:${base.lfMaterialId}`;
              } else {
                base.lfSelectionValue = null;
              }
              if (lfd) {
                base.copiesStr = String(lfd.quantity);
                base.lfPrintWidthCmStr = String(lfd.printWidthCm);
                base.lfPrintHeightCmStr = String(lfd.printHeightCm);
                base.lfCustomerType = lfd.customerType;
                base.lfSizePresetId = lfd.sizePresetSnapshot?.presetId ?? null;
              }
            }
            if (pt === "business_card") {
              const bcd = parseBusinessCardLineData(line.businessCardLineData);
              base.bcSheetPaperId =
                line.sheetPaperId ?? bcd?.paperSnapshot.id ?? null;
              base.bcBackExistingFile =
                businessCardBack != null
                  ? {
                      id: businessCardBack.id,
                      fileName: businessCardBack.fileName,
                    }
                  : null;
              if (bcd) {
                base.copiesStr = String(bcd.quantity);
                base.bcSides = bcd.sides;
                base.lfCustomerType = bcd.customerType;
                const trim = businessCardTrimSize(bcd);
                base.bcPresetId = bcd.presetId ?? "custom";
                base.bcTrimWidthStr = String(trim.widthCm);
                base.bcTrimHeightStr = String(trim.heightCm);
              }
            }
            nextAssign[sid] = base;
          }
        }

        // Derive the order-level tier from the hydrated LF lines. Client's
        // isDealer flag wins when a registered client is attached; otherwise
        // fall back to the first LF line's tier; else default to retail.
        // If distinct tiers were present, we normalize + flag for a banner
        // so the operator knows to double-check prices.
        const lfTiers = Object.values(nextAssign)
          .filter((a) => a.productType === "large_format_print")
          .map((a) => a.lfCustomerType);
        const hadMixedTiers = new Set(lfTiers).size > 1;
        const chosenTier: LargeFormatCustomerType = order.studioClient
          ? order.studioClient.isDealer
            ? "dealer"
            : "retail"
          : lfTiers[0] ?? "retail";

        setSlots(nextSlots);
        setAssignBySlot(nextAssign);
        setCustomer({
          ...EMPTY_CUSTOMER_VALUE,
          phone: order.phone,
          clientName: order.clientName ?? "",
          notes: order.notes ?? "",
          priceStr:
            order.price != null && Number.isFinite(Number(order.price))
              ? round2(Number(order.price)).toFixed(2)
              : "",
          selectedClient: order.studioClient ?? null,
          customerType: chosenTier,
        });
        setMixedTierBanner(hadMixedTiers ? chosenTier : null);
        setEditLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setEditLoadError(
            e instanceof Error ? e.message : "Failed to load order",
          );
          setEditLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editOrderId]);

  const syncAssignForSlots = useCallback(() => {
    setAssignBySlot((prev) => {
      const next = { ...prev };
      for (const s of slots) {
        if (!next[s.id]) {
          next[s.id] = defaultAssign(
            mugProductItems,
            notebookProductItems,
            penProductItems,
            lfMaterialItems[0]?.id ?? null,
            customer.customerType,
            bcDefaultSheetPaperId,
          );
        }
      }
      for (const id of Object.keys(next)) {
        if (!slots.some((x) => x.id === id)) {
          delete next[id];
        }
      }
      return next;
    });
  }, [
    slots,
    mugProductItems,
    notebookProductItems,
    penProductItems,
    lfMaterialItems,
    customer.customerType,
    bcDefaultSheetPaperId,
  ]);

  useEffect(() => {
    syncAssignForSlots();
  }, [syncAssignForSlots]);

  // Mirror the order-level tier (customer.customerType) into every slot's
  // `lfCustomerType`. Single source of truth: the tier picker in
  // `AdminCustomerForm`. Guards against no-op writes so we do not thrash React
  // into re-render loops.
  useEffect(() => {
    setAssignBySlot((prev) => {
      let changed = false;
      const next: Record<string, SlotAssign> = {};
      for (const [id, a] of Object.entries(prev)) {
        if (a.lfCustomerType === customer.customerType) {
          next[id] = a;
          continue;
        }
        next[id] = { ...a, lfCustomerType: customer.customerType };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [customer.customerType]);

  const designsParam = searchParams.get("designs") ?? initialDesigns;
  const designsHydratedRef = useRef(false);

  useEffect(() => {
    if (editOrderId || designsHydratedRef.current || !designsParam) return;

    let cancelled = false;
    const ids = designsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_WIZARD_SLOTS);
    if (ids.length === 0) return;

    const ds = useLanguageStore.getState().t.admin.designStudio;
    setDesignsHydrating(true);
    setError("");

    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/designs/batch?ids=${encodeURIComponent(ids.join(","))}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setError(ds.orderPrefillFileFailed);
          return;
        }
        const data = (await res.json()) as { items: DesignListItemJson[] };
        const designs = (data.items ?? []).filter((d) => d.renderKey);
        if (cancelled) return;
        if (designs.length === 0) {
          setError(ds.orderPrefillNoRender);
          return;
        }

        const nextSlots: AdminWizardSlot[] = [];
        const nextAssign: Record<string, SlotAssign> = {};
        const fallback = defaultAssign(
          mugProductItemsRef.current,
          notebookProductItemsRef.current,
          penProductItemsRef.current,
          lfMaterialItemsRef.current[0]?.id ?? null,
          customerTypeRef.current,
          bcDefaultSheetPaperIdRef.current,
        );

        let fileFailed = false;
        for (const design of designs) {
          const fileRes = await fetch(resolveR2Key(design.renderKey!));
          if (cancelled) return;
          if (!fileRes.ok) {
            fileFailed = true;
            continue;
          }
          const blob = await fileRes.blob();
          const fileName = buildDesignFileName({
            title: design.title,
            sku: design.productSku,
            designId: design.id,
          });
          const file = new File([blob], fileName, { type: blob.type || "image/png" });
          const sid = newSlotId();
          nextSlots.push({ id: sid, file, sourceOrderLineId: null });

          const assign: SlotAssign = { ...fallback, designId: design.id, paperPrint: null };
          if (design.targetType === "mug" && design.mugProductId) {
            assign.productType = "mug";
            assign.mugPick = { type: "catalog", productId: design.mugProductId };
            assign.mugLayoutData = minimalUploadReadyMugLayout();
          } else if (design.targetType === "notebook" && design.notebookProductId) {
            assign.productType = "notebook";
            assign.nbPick = { type: "catalog", productId: design.notebookProductId };
            assign.notebookLayoutData = minimalUploadReadyNotebookLayout();
          } else {
            assign.productType = "paper_print";
            assign.paperPrint = defaultPaperPrint();
          }
          nextAssign[sid] = assign;
        }

        if (cancelled) return;
        if (nextSlots.length === 0) {
          setError(fileFailed ? ds.orderPrefillFileFailed : ds.orderPrefillNoRender);
          return;
        }
        designsHydratedRef.current = true;
        setSlots(nextSlots);
        setAssignBySlot(nextAssign);
        if (fileFailed) setError(ds.orderPrefillFileFailed);
      } catch {
        if (!cancelled) setError(ds.orderPrefillFileFailed);
      } finally {
        if (!cancelled) setDesignsHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [designsParam, editOrderId]);

  // Без preventDefault на dragover/drop браузер открывает файл вместо срабатывания зоны.
  useEffect(() => {
    if (step !== "files") return;
    const preventNav = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", preventNav);
    window.addEventListener("drop", preventNav);
    return () => {
      window.removeEventListener("dragover", preventNav);
      window.removeEventListener("drop", preventNav);
    };
  }, [step]);

  const totalSteps = STEP_ORDER.length;
  const stepIndex = STEP_ORDER.indexOf(step);

  const mugById = useMemo(
    () => new Map(mugProductItems.map((m) => [m.id, m])),
    [mugProductItems],
  );
  const nbById = useMemo(
    () => new Map(notebookProductItems.map((m) => [m.id, m])),
    [notebookProductItems],
  );
  const penById = useMemo(
    () => new Map(penProductItems.map((m) => [m.id, m])),
    [penProductItems],
  );
  const lfById = useMemo(
    () => new Map(lfMaterialItems.map((m) => [m.id, m])),
    [lfMaterialItems],
  );

  const lfPrintEconomicsPayload = useMemo((): Parameters<
    typeof lfPricingFromSlotInputs
  >[0]["printEconomics"] => {
    if (!printEconomics) return null;
    return {
      inkMlPerSqmLargeFormatRoll: printEconomics.inkMlPerSqmLargeFormatRoll,
      avgInkCostPerMlMdl: printEconomics.avgInkCostPerMlMdl,
      lfInkRetailMarkupMultiplier: printEconomics.lfInkRetailMarkupMultiplier,
      lfInkDealerMarkupMultiplier: printEconomics.lfInkDealerMarkupMultiplier,
    };
  }, [printEconomics]);

  const lfMinimumLineTotalMdlEffective =
    printEconomics?.lfMinimumLineTotalMdl ?? 0;

  const bcPaperById = useMemo(
    () => new Map(bcPaperItems.map((p) => [p.id, p])),
    [bcPaperItems],
  );
  const bcMinimumLineTotalMdlEffective =
    printEconomics?.bcMinimumLineTotalMdl ?? 0;

  // ── Family group cross-line packing preview ────────────────────────────
  // Groups same-family + same-customer-type LF slots and computes ONE
  // combined layout + pricing. Different customer types (dealer vs retail)
  // never share a group — each tier is billed on its own cheapest roll at
  // its own sell rate.
  interface LfFamilyGroupSlotResult {
    diagram: {
      printableWidthCm: number;
      totalAlongCm: number;
      placements: Array<{
        xCm: number;
        yCm: number;
        crossCm: number;
        alongCm: number;
        rotated: boolean;
      }>;
    };
    groupSize: number;
    slotTotalPriceMdl: number;
    /**
     * The concrete roll picked for this group (cheapest total sell). Wizard
     * uses this to render "рассчитано по рулону X м" so the label always
     * matches the layout diagram — not the per-slot narrowest-sufficient
     * pick from `resolveFamilyPreviewMaterial`.
     */
    billingMaterialId: string;
    billingMaterialName: string;
    billingRollWidthMeters: number;
  }

  const lfFamilyGroupData = useMemo((): Map<string, LfFamilyGroupSlotResult> => {
    const result = new Map<string, LfFamilyGroupSlotResult>();
    type SlotInfo = {
      slotId: string;
      effW: number;
      effH: number;
      quantity: number;
      customerType: LargeFormatCustomerType;
    };

    const familyGroupsMap = new Map<
      string,
      { infos: SlotInfo[]; members: AdminLargeFormatMaterialJson[] }
    >();

    for (const s of slots) {
      const a = assignBySlot[s.id];
      if (!a || a.productType !== "large_format_print") continue;
      const sv =
        a.lfSelectionValue ??
        (a.lfMaterialId ? `material:${a.lfMaterialId}` : null);
      const sel = parseSelectionValue(sv);
      if (sel.type !== "family" || !sel.id) continue;

      const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
      const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
      const q = parseAdminCopiesInput(a.copiesStr);
      if (
        !Number.isFinite(w) ||
        w <= 0 ||
        !Number.isFinite(h) ||
        h <= 0 ||
        !q ||
        q < 1
      )
        continue;

      // Family members share the same base material name → same gallery-wrap
      // policy. Pick any member for wrap resolution.
      const members = lfMaterialItems.filter(
        (m) => lfMaterialFamilyKey(m.name) === sel.id,
      );
      if (members.length === 0) continue;
      const galleryWrapCm = resolveGalleryWrapCm(members[0]!.name);
      const effW = w + 2 * galleryWrapCm;
      const effH = h + 2 * galleryWrapCm;

      // Composite key: same family AND same customer type share a group.
      // Mirrors server-side `groupLinesForPacking`.
      const groupKey = `${sel.id}::${a.lfCustomerType}`;
      const existing = familyGroupsMap.get(groupKey);
      if (existing) {
        existing.infos.push({
          slotId: s.id,
          effW,
          effH,
          quantity: q,
          customerType: a.lfCustomerType,
        });
      } else {
        familyGroupsMap.set(groupKey, {
          infos: [
            { slotId: s.id, effW, effH, quantity: q, customerType: a.lfCustomerType },
          ],
          members,
        });
      }
    }

    for (const [, { infos, members }] of familyGroupsMap) {
      // Include single-line families too — cheapest-roll may still differ
      // from the narrowest sufficient (e.g. rotation-friendly wider roll).
      if (infos.length === 0) continue;

      const customerType = infos[0]!.customerType;

      // Build tiles once (identical for every candidate roll).
      const tiles: GroupTilePackTile[] = [];
      for (let idx = 0; idx < infos.length; idx++) {
        const info = infos[idx]!;
        for (let copy = 1; copy <= info.quantity; copy++) {
          tiles.push({
            id: `S${idx}::${copy}`,
            label: `Pos ${idx + 1} (${copy}/${info.quantity})`,
            widthCm: info.effW,
            heightCm: info.effH,
            allowRotate: true,
          });
        }
      }

      // Try every roll in the family; pick the one with the lowest
      // material sell total (LM × per-LM sell rate for this customer type).
      type Candidate = {
        mat: AdminLargeFormatMaterialJson;
        printableCm: number;
        pack: ReturnType<typeof packGroupTiles>;
        totalLm: number;
        materialSellMdl: number;
      };
      let best: Candidate | null = null;
      for (const cand of members) {
        const printableM = resolveEffectivePrintableWidthMeters({
          printableWidthMeters: cand.printableWidthMeters,
          rollWidthMeters: cand.rollWidthMeters,
        });
        const printableCm = printableM * 100;
        const pack = packGroupTiles(
          tiles,
          printableCm,
          GROUP_TILE_PACK_DEFAULT_GAP_CM,
        );
        if (pack.unplacedTileIds.length > 0) continue;
        const totalLm = pack.totalAlongCm / 100;
        const perLmSell =
          customerType === "dealer"
            ? (cand.effectiveDealerPricePerLinearMeter ?? 0)
            : (cand.effectiveRetailPricePerLinearMeter ?? 0);
        const materialSellMdl = totalLm * perLmSell;
        if (!best || materialSellMdl < best.materialSellMdl) {
          best = { mat: cand, printableCm, pack, totalLm, materialSellMdl };
        }
      }
      if (!best) continue;

      const { mat: groupMat, printableCm, pack, totalLm } = best;
      const totalArea = pack.placements.reduce(
        (s, p) => s + p.widthCm * p.heightCm,
        0,
      );

      const effCostLm = effectiveLfMaterialCostPerLinearMeterMdl({
        costPerLinearMeter: groupMat.costPerLinearMeter,
        avgPurchaseCostPerLinearMeter: groupMat.avgPurchaseCostPerLinearMeter,
      });

      const totalMaterialPricing = computeLargeFormatLinePricing({
        calculatedLinearMeters: totalLm,
        customerType,
        material: {
          costPerLinearMeter: effCostLm,
          finalRetailPricePerLinearMeter:
            groupMat.effectiveRetailPricePerLinearMeter ?? 0,
          finalDealerPricePerLinearMeter:
            groupMat.effectiveDealerPricePerLinearMeter ?? 0,
          dealerPricePerLinearMeter: groupMat.dealerPricePerLinearMeter,
          retailPricePerLinearMeter: groupMat.retailPricePerLinearMeter,
          dealerPrintPricePerLinearMeter:
            groupMat.dealerPrintPricePerLinearMeter,
          retailPrintPricePerLinearMeter:
            groupMat.retailPrintPricePerLinearMeter,
        },
      });

      let totalGroupPrice = totalMaterialPricing.totalSellPrice;

      const pe = lfPrintEconomicsPayload;
      if (pe) {
        const totalUsefulAreaSqm = infos.reduce(
          (sum, info) => sum + (info.effW * info.effH * info.quantity) / 10000,
          0,
        );
        const inkMlUsed = pe.inkMlPerSqmLargeFormatRoll * totalUsefulAreaSqm;
        const inkCostMdl = roundMoneyMdl(inkMlUsed * pe.avgInkCostPerMlMdl);
        const inkSellMdl = computeLfInkSellPriceMdl(
          inkCostMdl,
          customerType,
          pe,
        );
        totalGroupPrice = roundMoneyMdl(
          totalMaterialPricing.materialSellPrice + inkSellMdl,
        );
      }

      if (
        customerType !== "dealer" &&
        lfMinimumLineTotalMdlEffective > 0 &&
        totalGroupPrice < lfMinimumLineTotalMdlEffective
      ) {
        totalGroupPrice = Math.round(lfMinimumLineTotalMdlEffective);
      }

      const diagram = {
        printableWidthCm: printableCm,
        totalAlongCm: pack.totalAlongCm,
        placements: pack.placements.map((p) => ({
          xCm: p.xCm,
          yCm: p.yCm,
          crossCm: p.widthCm,
          alongCm: p.heightCm,
          rotated: p.rotated,
        })),
      };

      for (let idx = 0; idx < infos.length; idx++) {
        const info = infos[idx]!;
        const slotPlacements = pack.placements.filter((p) =>
          p.tileId.startsWith(`S${idx}::`),
        );
        const slotArea = slotPlacements.reduce(
          (s, p) => s + p.widthCm * p.heightCm,
          0,
        );
        const areaShare =
          totalArea > 0 ? slotArea / totalArea : 1 / infos.length;
        const slotPrice = roundMoneyMdl(totalGroupPrice * areaShare);

        result.set(info.slotId, {
          diagram,
          groupSize: infos.length,
          slotTotalPriceMdl: slotPrice,
          billingMaterialId: groupMat.id,
          billingMaterialName: groupMat.name,
          billingRollWidthMeters: Number(groupMat.rollWidthMeters),
        });
      }
    }

    return result;
  }, [
    slots,
    assignBySlot,
    lfMaterialItems,
    lfPrintEconomicsPayload,
    lfMinimumLineTotalMdlEffective,
  ]);

  const editPageBlocking =
    Boolean(editOrderId) && !editLoadError && editLoading;

  const orderLinesSubtotalMdl = useMemo(() => {
    let sum = 0;
    for (const s of slots) {
      const a = assignBySlot[s.id];
      if (!a) continue;
      const groupData = lfFamilyGroupData.get(s.id);
      if (
        groupData &&
        a.productType === "large_format_print" &&
        !parsedLinePriceMdl(a.linePriceStr)
      ) {
        sum += groupData.slotTotalPriceMdl;
      } else {
        sum += effectiveLineTotalMdl(
          a,
          mugById,
          nbById,
          penById,
          lfById,
          lfMaterialItems,
          lfPrintEconomicsPayload,
          lfMinimumLineTotalMdlEffective,
          bcPaperById,
          bcMinimumLineTotalMdlEffective,
        );
      }
    }
    return sum;
  }, [
    slots,
    assignBySlot,
    mugById,
    nbById,
    penById,
    lfById,
    lfMaterialItems,
    lfPrintEconomicsPayload,
    lfMinimumLineTotalMdlEffective,
    lfFamilyGroupData,
    bcPaperById,
    bcMinimumLineTotalMdlEffective,
  ]);

  useEffect(() => {
    // Edit-режим: цена была сохранена админом ранее — не перетираем её
    // авто-расчётом из строк после гидрации. Если нужно пересчитать,
    // админ сам очистит поле "Цена". Без этого guard'а после загрузки
    // заказа поле затиралось суммой `orderLinesSubtotalMdl`, которая
    // часто равна 0 (paper_print без unit price, удалённый каталожный
    // SKU и т.п.) — что и проявлялось как "автоматически стирается
    // цена".
    if (editOrderId) return;

    const next =
      orderLinesSubtotalMdl > 0
        ? round2(orderLinesSubtotalMdl).toFixed(2)
        : "";
    setCustomer((prev) => {
      if (prev.priceStr === next) return prev;
      return { ...prev, priceStr: next };
    });
  }, [orderLinesSubtotalMdl, editOrderId]);

  const layoutFocusDoneRef = useRef(false);
  useEffect(() => {
    layoutFocusDoneRef.current = false;
  }, [editOrderId, focusOrderLineParam]);

  useEffect(() => {
    if (!editOrderId || editPageBlocking || layoutFocusDoneRef.current) return;
    if (!focusOrderLineParam) return;
    requestAnimationFrame(() => {
      document.getElementById("wizard-layout-focus")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      layoutFocusDoneRef.current = true;
    });
  }, [editOrderId, editPageBlocking, focusOrderLineParam, slots.length]);

  const catalogSkuModalRow = useMemo(() => {
    if (!catalogSkuModalSlotId) return null;
    const a = assignBySlot[catalogSkuModalSlotId];
    if (!a) return null;
    const kind = CATALOG_SKU_KIND_BY_PRODUCT[a.productType];
    if (!kind) return null;
    return { slotId: catalogSkuModalSlotId, assign: a, kind };
  }, [catalogSkuModalSlotId, assignBySlot]);

  /** First slot per line key — `?line=` scroll anchor targets this row. */
  const firstSlotIdByLineKey = useMemo(() => {
    const leaders = new Map<string, string>();
    for (const slot of slots) {
      const lk = wizardLineKey(slot);
      if (!leaders.has(lk)) leaders.set(lk, slot.id);
    }
    return leaders;
  }, [slots]);

  const productTypeSelectOptions = useMemo(
    (): MenuSelectOption<ProductType>[] =>
      PRODUCT_OPTIONS.map((o) => ({
        value: o.id,
        label: {
          paper: t.mug.productPaperPrint,
          mug: t.mug.productMug,
          nb: t.notebook.productNotebook,
          pen: t.admin.productTypePen,
          lf: t.admin.productTypeLargeFormat,
          bc: t.admin.productTypeBusinessCard,
        }[o.labelKey],
      })),
    [t],
  );

  function updateSlot(id: string, patch: Partial<SlotAssign>): void {
    setAssignBySlot((prev) => {
      const prevRow = prev[id];
      const merged: SlotAssign = {
        ...defaultAssign(
          mugProductItems,
          notebookProductItems,
          penProductItems,
          lfMaterialItems[0]?.id ?? null,
          customer.customerType,
          bcDefaultSheetPaperId,
        ),
        ...prevRow,
        ...patch,
      };
      const productTypeChanged =
        patch.productType !== undefined &&
        prevRow?.productType !== patch.productType;
      const linePriceStr = productTypeChanged ? "" : merged.linePriceStr;
      const mergedWithPrice: SlotAssign = { ...merged, linePriceStr };
      const pt = mergedWithPrice.productType;
      let paperPrint = mergedWithPrice.paperPrint;
      if (pt !== "paper_print") {
        paperPrint = null;
      } else if (!paperPrint) {
        paperPrint = defaultPaperPrint();
      }
      let { lfMaterialId } = mergedWithPrice;
      if (pt === "large_format_print" && !lfMaterialId && lfMaterialItems[0]) {
        lfMaterialId = lfMaterialItems[0].id;
      }
      return {
        ...prev,
        [id]: { ...mergedWithPrice, paperPrint, lfMaterialId },
      };
    });
  }

  function removeSlot(slotId: string): void {
    if (catalogSkuModalSlotId === slotId) {
      setCatalogSkuModalSlotId(null);
    }
    setSlots((prev) => prev.filter((x) => x.id !== slotId));
    setSelectedSlots((prev) => {
      const n = new Set(prev);
      n.delete(slotId);
      return n;
    });
  }

  function addWizardRow(): void {
    setSlots((prev) => {
      if (prev.length >= MAX_WIZARD_SLOTS) return prev;
      return [{ id: newSlotId(), sourceOrderLineId: null }, ...prev];
    });
  }

  function canAdvance(): boolean {
    if (step === "files") {
      if (slots.length < 1 || slots.length > MAX_WIZARD_SLOTS) return false;
      for (const s of slots) {
        if (!s.file && !s.existingFile) return false;
        const a = assignBySlot[s.id];
        if (!a) return false;
        const cop = parseAdminCopiesInput(a.copiesStr);
        if (cop === null) return false;
        if (a.productType === "paper_print") {
          if (!a.paperPrint) return false;
          if (
            a.paperPrint.paperType === "other" &&
            (!a.paperPrint.customWidth.trim() ||
              !a.paperPrint.customHeight.trim())
          ) {
            return false;
          }
        }
        if (a.productType === "mug") {
          if (!a.mugPick) return false;
          if (a.mugPick.type === "catalog" && !a.mugPick.productId)
            return false;
          const v = mugUploadOk[s.id];
          if (a.mugPick.type === "catalog") {
            if (v === null || v === undefined) return false;
            if (!v.ok) return false;
          }
        }
        if (a.productType === "notebook") {
          if (!a.nbPick) return false;
          if (a.nbPick.type === "catalog" && !a.nbPick.productId)
            return false;
          const v = nbUploadOk[s.id];
          if (a.nbPick.type === "catalog") {
            if (v === null || v === undefined) return false;
            if (!v.ok) return false;
          }
        }
        if (a.productType === "pen") {
          if (!a.penPick) return false;
          if (a.penPick.type === "catalog" && !a.penPick.productId)
            return false;
          const v = penUploadOk[s.id];
          if (a.penPick.type === "catalog") {
            if (v === null || v === undefined) return false;
            if (!v.ok) return false;
          }
        }
        if (a.productType === "large_format_print") {
          if (!a.lfMaterialId && !a.lfSelectionValue) return false;
          const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
          const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
          if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0)
            return false;
          const mat = resolveFamilyPreviewMaterial({
            selectionValue:
              a.lfSelectionValue ??
              (a.lfMaterialId ? `material:${a.lfMaterialId}` : null),
            materials: lfMaterialItems,
            printWidthCm: w,
            printHeightCm: h,
            quantity: cop,
            customerType: a.lfCustomerType,
          });
          if (!mat) return false;
          const printableCm =
            resolveEffectivePrintableWidthMeters({
              printableWidthMeters: mat.printableWidthMeters,
              rollWidthMeters: mat.rollWidthMeters,
            }) * 100;
          if (!lfPieceFitsAcrossPrintableWidthCm(w, h, printableCm)) return false;
          const presetForCheck = lfActivePresetForSlot(
            { ...a, lfMaterialId: mat.id },
            lfById,
          );
          const lfCheck = lfPricingFromSlotInputs({
            mat,
            printWidthCm: w,
            printHeightCm: h,
            quantity: cop,
            customerType: a.lfCustomerType,
            sizePreset: presetForCheck ? { unitPriceMdl: presetForCheck.unitPriceMdl } : null,
            printEconomics: lfPrintEconomicsPayload,
            lfMinimumLineTotalMdl: lfMinimumLineTotalMdlEffective,
          });
          if (!lfCheck.ok) return false;
        }
        if (a.productType === "business_card") {
          if (!a.bcSheetPaperId) return false;
          // A double-sided run needs the reverse artwork; the front comes from
          // the row's own file like every other product. In edit mode the
          // reverse may already be on the order instead of freshly picked.
          if (a.bcSides === "two" && !a.bcBackFile && !a.bcBackExistingFile) {
            return false;
          }
          if (
            !bcSlotPricing(a, bcPaperById, bcMinimumLineTotalMdlEffective) &&
            !parsedLinePriceMdl(a.linePriceStr)
          ) {
            return false;
          }
        }
      }
      return customer.phone.length >= 8;
    }
    return true;
  }

  useEffect(() => {
    if (step === "confirm") return;
    let cancelled = false;
    (async () => {
      const results: Record<
        CatalogSkuPickModalKind,
        Record<string, SizeValidationResult | null>
      > = { mug: {}, notebook: {}, pen: {} };

      for (const s of slots) {
        const a = assignBySlot[s.id];
        for (const kind of CATALOG_SKU_KINDS) {
          const expected =
            a && a.productType === kind
              ? expectedLayoutPx(a, kind, mugById, nbById, penById)
              : null;
          results[kind][s.id] = expected
            ? await measureSlotLayout(s, expected)
            : null;
          if (cancelled) return;
        }
      }

      setMugUploadOk(results.mug);
      setNbUploadOk(results.notebook);
      setPenUploadOk(results.pen);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, slots, assignBySlot, mugById, nbById, penById]);

  useEffect(() => {
    if (step === "confirm") return;
    let cancelled = false;
    (async () => {
      for (const s of slots) {
        const a = assignBySlot[s.id];
        if (a?.productType !== "paper_print" || !a.paperPrint) continue;
        if (a.paperPrint.pageCount !== undefined) continue;
        if (!s.file || s.file.type !== "application/pdf") continue;
        const count = await getPdfPageCount(s.file);
        if (cancelled) return;
        setAssignBySlot((prev) => {
          const cur = prev[s.id];
          if (!cur?.paperPrint || cur.paperPrint.pageCount !== undefined) {
            return prev;
          }
          return {
            ...prev,
            [s.id]: {
              ...cur,
              paperPrint: { ...cur.paperPrint, pageCount: count },
            },
          };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, slots, assignBySlot]);

  function goNext(): void {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1]!);
    }
  }

  function goBack(): void {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]!);
  }

  async function handleSubmit(): Promise<void> {
    // Ref guard: the `submitting` state update is async, so a fast
    // double-click on the submit button can fire two `handleSubmit`
    // calls in the same tick (before React re-renders the disabled
    // button). The ref flips synchronously and short-circuits the
    // second invocation, preventing duplicate orders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    let navigated = false;
    try {
      const priceField = parseAmountMdl(customer.priceStr) ?? undefined;

      if (editOrderId) {
        const patchAssign = applyMinimalLayoutJsonWhenNewUpload(
          slots,
          assignBySlot,
        );
        // Only rows with a NEW local file get uploaded on save; rows backed by
        // an already-stored file are reused. Track just those for the checklist.
        const uploadSlotIds = slots.filter((s) => s.file).map((s) => s.id);
        if (uploadSlotIds.length > 0) {
          setUploadPhase("uploading");
          setUploadStatuses(
            Object.fromEntries(
              uploadSlotIds.map((sid) => [sid, "pending"]),
            ) as Record<string, "pending" | "uploading" | "done" | "error">,
          );
        } else {
          setUploadPhase("creating");
        }
        const lines = await buildAdminOrderUpdateLines(
          slots,
          patchAssign,
          bcPaperById,
          (slotId, status) =>
            setUploadStatuses((prev) => ({ ...prev, [slotId]: status })),
        );
        setUploadPhase("creating");
        const trimmedPrice = customer.priceStr.trim();
        const patchBody: Record<string, unknown> = {
          phone: customer.phone,
          clientName: customer.clientName.trim() || undefined,
          clientId: customer.selectedClient?.id ?? null,
          notes: customer.notes.trim() || null,
          lines,
        };
        if (trimmedPrice === "") {
          patchBody.price = null;
        } else {
          const pv = parseAmountMdl(trimmedPrice);
          if (pv !== null) patchBody.price = pv;
        }
        const res = await fetch(`/api/admin/orders/${editOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            detail?: string;
          };
          if (body.detail || body.error) {
            console.error(
              "[PATCH /api/admin/orders/:id] %s — %s",
              body.error ?? `HTTP ${res.status}`,
              body.detail ?? "(no detail)",
            );
          }
          throw new Error(body.error ?? "Failed to update order");
        }
        router.push(backHref);
        router.refresh();
        navigated = true;
        return;
      }

      const lines: AdminOrderLineInput[] = [];

      setUploadPhase("uploading");
      setUploadStatuses(
        Object.fromEntries(slots.map((s) => [s.id, "pending"])) as Record<
          string,
          "pending" | "uploading" | "done" | "error"
        >,
      );

      for (const slot of slots) {
        const a = assignBySlot[slot.id];
        if (!a) throw new Error("Missing row config");
        const localFile = slot.file;
        if (!localFile) throw new Error("Missing file");
        setUploadStatuses((prev) => ({ ...prev, [slot.id]: "uploading" }));

        if (a.productType === "paper_print") {
          const paperCopies = parseAdminCopiesInput(a.copiesStr);
          if (paperCopies === null) throw new Error("Invalid copies");
          const pp = a.paperPrint;
          if (!pp) throw new Error("Paper options missing");
          const { fileName, fileUrl } = await uploadFile(localFile);
          lines.push({
            productType: "paper_print",
            designId: a.designId ?? undefined,
            files: [
              {
                fileName,
                fileUrl,
                copies: paperCopies,
                color: pp.color,
                paperType: resolvedPaperStorageValue(pp),
                pageCount: pp.pageCount,
              },
            ],
          });
        } else if (a.productType === "mug") {
          const mugCopies = parseAdminCopiesInput(a.copiesStr);
          if (mugCopies === null) throw new Error("Invalid copies");
          const mugOther = a.mugPick?.type === "other";
          const mugCatId =
            a.mugPick?.type === "catalog" ? a.mugPick.productId : undefined;
          const mugLayoutData = a.mugLayoutData ?? minimalUploadReadyMugLayout();
          const { fileName, fileUrl } = await uploadFile(localFile);
          lines.push({
            productType: "mug",
            mugLayoutData,
            mugOther,
            mugProductId: mugCatId,
            designId: a.designId ?? undefined,
            files: [{ fileName, fileUrl, copies: mugCopies, color: "color" }],
          });
        } else if (a.productType === "large_format_print") {
          const qty = parseAdminCopiesInput(a.copiesStr);
          if (qty === null) throw new Error("Invalid copies");
          const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
          const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
          if (!Number.isFinite(w) || !Number.isFinite(h)) {
            throw new Error("Invalid dimensions");
          }
          if (!a.lfMaterialId && !a.lfSelectionValue) throw new Error("Material required");
          const { fileName, fileUrl } = await uploadFile(localFile);
          
          // Parse selection: either material:id or family:key.
          const sel = parseSelectionValue(a.lfSelectionValue ?? `material:${a.lfMaterialId}`);
          if (!sel.id || (sel.type !== "material" && sel.type !== "family")) {
            throw new Error("Material required");
          }
          const familyOrMaterial =
            sel.type === "family"
              ? { materialFamilyKey: sel.id }
              : { largeFormatMaterialId: sel.id };

          lines.push({
            productType: "large_format_print",
            designId: a.designId ?? undefined,
            ...familyOrMaterial,
            printWidthCm: w,
            printHeightCm: h,
            quantity: qty,
            customerType: a.lfCustomerType,
            lfSizePresetId: a.lfSizePresetId ?? null,
            files: [
              {
                fileName,
                fileUrl,
                copies: qty,
                color: "color",
                paperType: "large_format",
              },
            ],
          });
        } else if (a.productType === "business_card") {
          if (!a.bcSheetPaperId) throw new Error("Paper required");
          if (a.bcSides === "two" && !a.bcBackFile) {
            throw new Error("Back artwork required");
          }
          const trim = bcAssignTrimSize(a);
          if (!trim) throw new Error("Card size required");
          // The run must fill whole sheets; take the rounded figure the row has
          // been pricing so the server does not reject it.
          const priced = bcSlotPricing(
            a,
            bcPaperById,
            bcMinimumLineTotalMdlEffective,
          );
          if (!priced) throw new Error("Invalid business card line");

          // One line, one or two files: the sheet is imposed in the workshop,
          // so the faces must stay together instead of becoming two lines.
          const front = await uploadFile(localFile);
          const back = a.bcBackFile ? await uploadFile(a.bcBackFile) : null;

          lines.push({
            productType: "business_card",
            designId: a.designId ?? undefined,
            sheetPaperId: a.bcSheetPaperId,
            quantity: priced.quantity,
            cardSides: a.bcSides,
            cardPresetId: a.bcPresetId,
            cardTrimWidthCm: trim.trimWidthCm,
            cardTrimHeightCm: trim.trimHeightCm,
            customerType: a.lfCustomerType,
            files: [
              {
                fileName: front.fileName,
                fileUrl: front.fileUrl,
                copies: 1,
                color: "color",
                paperType: BUSINESS_CARD_FRONT_PAPER_TYPE,
              },
              ...(back
                ? [
                    {
                      fileName: back.fileName,
                      fileUrl: back.fileUrl,
                      copies: 1,
                      color: "color" as const,
                      paperType: BUSINESS_CARD_BACK_PAPER_TYPE,
                    },
                  ]
                : []),
            ],
          });
        } else if (a.productType === "notebook") {
          const nbCopies = parseAdminCopiesInput(a.copiesStr);
          if (nbCopies === null) throw new Error("Invalid copies");
          const nbOther = a.nbPick?.type === "other";
          const nbCatId =
            a.nbPick?.type === "catalog" ? a.nbPick.productId : undefined;
          const notebookLayoutData =
            a.notebookLayoutData ?? minimalUploadReadyNotebookLayout();
          const { fileName, fileUrl } = await uploadFile(localFile);
          lines.push({
            productType: "notebook",
            notebookLayoutData,
            notebookOther: nbOther,
            notebookProductId: nbCatId,
            designId: a.designId ?? undefined,
            files: [{ fileName, fileUrl, copies: nbCopies, color: "color" }],
          });
        } else if (a.productType === "pen") {
          const penCopies = parseAdminCopiesInput(a.copiesStr);
          if (penCopies === null) throw new Error("Invalid copies");
          const penOther = a.penPick?.type === "other";
          const penCatId =
            a.penPick?.type === "catalog" ? a.penPick.productId : undefined;
          const penLayoutData = a.penLayoutData ?? minimalUploadReadyPenLayout();
          const { fileName, fileUrl } = await uploadFile(localFile);
          lines.push({
            productType: "pen",
            penLayoutData,
            penOther,
            penProductId: penCatId,
            designId: a.designId ?? undefined,
            files: [{ fileName, fileUrl, copies: penCopies, color: "color" }],
          });
        } else {
          throw new Error("Unknown product type");
        }
        setUploadStatuses((prev) => ({ ...prev, [slot.id]: "done" }));
      }

      setUploadPhase("creating");
      await createAdminOrder({
        phone: customer.phone,
        clientName: customer.clientName.trim() || undefined,
        clientId: customer.selectedClient?.id,
        notes: customer.notes.trim() || undefined,
        price: priceField,
        lines,
        fromInvoiceLineItemId: fromInvoiceLineItemId ?? undefined,
      });

      router.push(backHref);
      router.refresh();
      navigated = true;
    } catch (err) {
      setError(formatLfAdminOrderSaveError(err, t.admin.newOrderPage));
      // Surface which file failed: flip any still-uploading entry to "error".
      setUploadStatuses((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key] === "uploading") next[key] = "error";
        }
        return next;
      });
    } finally {
      submittingRef.current = false;
      // Keep the spinner up while the new RSC payload streams in;
      // resetting `submitting` here would briefly re-enable the
      // submit button mid-navigation and let a quick second click
      // fire a duplicate order.
      if (!navigated) {
        setSubmitting(false);
        setUploadPhase("idle");
      }
    }
  }

  function onFilesPick(list: FileList | File[]): void {
    const arr = Array.from(list).slice(0, MAX_WIZARD_SLOTS);
    setSlots((prev) => {
      const merged = [...prev];
      const newRows: AdminWizardSlot[] = [];
      for (const f of arr) {
        const emptyIdx = merged.findIndex((s) => !s.file && !s.existingFile);
        if (emptyIdx !== -1) {
          merged[emptyIdx] = {
            ...merged[emptyIdx]!,
            file: f,
          };
        } else {
          if (merged.length + newRows.length >= MAX_WIZARD_SLOTS) break;
          newRows.push({
            id: newSlotId(),
            file: f,
            sourceOrderLineId: null,
          });
        }
      }
      return [...newRows, ...merged];
    });
  }

  function applyBulkProduct(): void {
    if (selectedSlots.size === 0) return;
    setAssignBySlot((prev) => {
      const next = { ...prev };
      for (const id of selectedSlots) {
        const cur =
          next[id] ?? defaultAssign(
          mugProductItems,
          notebookProductItems,
          penProductItems,
          lfMaterialItems[0]?.id ?? null,
          customer.customerType,
          bcDefaultSheetPaperId,
        );
        next[id] = {
          ...cur,
          productType: bulkProduct,
          copiesStr: cur.copiesStr,
          linePriceStr:
            bulkProduct === cur.productType ? cur.linePriceStr : "",
          paperPrint:
            bulkProduct === "paper_print"
              ? (cur.paperPrint ?? defaultPaperPrint())
              : null,
        };
      }
      return next;
    });
  }

  const stepLabels = [
    t.admin.newOrderPage.stepOrderBuilderLabel,
    t.admin.newOrderPage.stepConfirmLabel,
  ];

  function lineSummaries(): Array<{
    id: string;
    name: string;
    product: string;
    copies: string;
  }> {
    return slots.map((s) => {
      const a = assignBySlot[s.id];
      const cop = a ? a.copiesStr : "—";
      let product = "—";
      if (a?.productType === "paper_print") product = t.mug.productPaperPrint;
      else if (a?.productType === "mug") product = t.mug.productMug;
      else if (a?.productType === "notebook") product = t.notebook.productNotebook;
      else if (a?.productType === "pen") product = t.admin.productTypePen;
      else if (a?.productType === "large_format_print")
        product = t.admin.productTypeLargeFormat;
      else if (a?.productType === "business_card")
        product = t.admin.productTypeBusinessCard;
      return {
        id: s.id,
        name:
          s.file?.name ??
          s.existingFile?.fileName ??
          t.admin.newOrderPage.fileNotChosenPlaceholder,
        product,
        copies: cop,
      };
    });
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:py-8 text-gray-900">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <NavLinkButton
            href={backHref}
            variant="ghost"
            size="sm"
            prefetch
            className="h-auto gap-1 px-2 py-1 text-sm font-normal text-gray-600"
            leadingIcon={<ChevronLeft className="h-4 w-4" />}
          >
            {t.admin.newOrderPage.cancel}
          </NavLinkButton>
          <h1 className="text-xl font-bold sm:text-2xl">
            {editOrderId ? t.admin.editOrderPage.title : t.admin.newOrderPage.title}
          </h1>
        </div>
      </header>

      <StepProgress
        current={stepIndex + 1}
        total={totalSteps}
        labels={stepLabels}
        formatLine={t.admin.newOrderPage.stepIndicator}
      />

      <div
        className={cn(
          "mt-4 rounded-2xl bg-white p-4 sm:p-6 shadow-sm border border-gray-200",
          "relative overflow-hidden",
          editPageBlocking && "min-h-[min(50vh,28rem)] sm:min-h-[min(55vh,30rem)]",
        )}
      >
        {step === "files" && (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
              <div className="space-y-3 lg:col-span-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {t.admin.newOrderPage.fileUploadTitle}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t.admin.newOrderPage.fileUploadHint(MAX_WIZARD_SLOTS)}
              </p>
              {designsHydrating && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-amber-800">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t.admin.designStudio.orderPrefillLoading}
                </p>
              )}
            </div>
            <div
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 sm:py-6 transition-colors",
                fileDragActive
                  ? "border-gold bg-amber-50/80"
                  : "border-gray-300 bg-gray-50 hover:bg-gray-100",
              )}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFileDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setFileDragActive(false);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setFileDragActive(false);
                if (e.dataTransfer.files?.length) {
                  onFilesPick(e.dataTransfer.files);
                }
              }}
            >
              <label className="flex w-full cursor-pointer flex-col items-center justify-center">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(ev) => {
                    if (ev.target.files?.length) onFilesPick(ev.target.files);
                    ev.target.value = "";
                  }}
                />
                <span className="text-sm font-medium text-gray-700">
                  {t.admin.newOrderPage.fileUploadDrop}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  {slots.length}/{MAX_WIZARD_SLOTS}
                </span>
              </label>
            </div>
              </div>

              <div className="lg:col-span-9">
                {mixedTierBanner ? (
                  <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p>
                      {t.admin.newOrderPage.lfMixedTierNormalized(
                        mixedTierBanner === "dealer"
                          ? t.admin.newOrderPage.lfDealer
                          : t.admin.newOrderPage.lfRetail,
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMixedTierBanner(null)}
                      className="shrink-0 rounded p-0.5 text-amber-800 hover:bg-amber-100"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                <AdminCustomerForm
                  value={customer}
                  onChange={setCustomer}
                  t={t}
                />
              </div>
            </div>

            {slots.length > 0 && (
              <div className="mt-6 space-y-4 border-t border-gray-100 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto pl-3">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      className="size-4 shrink-0 accent-gold"
                      checked={
                        slots.length > 0 && selectedSlots.size === slots.length
                      }
                      onChange={() => {
                        if (selectedSlots.size === slots.length) {
                          setSelectedSlots(new Set());
                        } else {
                          setSelectedSlots(new Set(slots.map((s) => s.id)));
                        }
                      }}
                      aria-label={t.admin.newOrderPage.bulkSelectAll}
                    />
                    <span className="shrink-0 whitespace-nowrap text-xs leading-none text-gray-500">
                      {t.admin.newOrderPage.bulkSetProduct}
                    </span>
                    <MenuSelect<ProductType>
                      className="min-w-[10rem] max-w-md flex-1 sm:min-w-[11rem]"
                      value={bulkProduct}
                      options={productTypeSelectOptions}
                      onChange={(v) => setBulkProduct(v)}
                      buttonClassName="text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      onClick={applyBulkProduct}
                    >
                      {t.admin.newOrderPage.bulkApply}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={slots.length >= MAX_WIZARD_SLOTS}
                    onClick={addWizardRow}
                    className="shrink-0 border-gray-300 text-gray-800 hover:bg-gray-50"
                  >
                    <Plus className="mr-1.5 size-4" aria-hidden />
                    {t.admin.newOrderPage.addOrderPosition}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed min-w-[1060px] text-sm">
                    <colgroup>
                      <col style={{ width: "28%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "26%" }} />
                      <col style={{ width: "5.5rem" }} />
                      <col style={{ width: "4.75rem" }} />
                      <col style={{ width: "2.75rem" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                        <th className="min-w-0 py-2 pl-3 pr-2 align-bottom font-normal">
                          {t.admin.newOrderPage.stepFilesLabel}
                        </th>
                        <th className="min-w-0 px-2.5 py-2 align-bottom font-normal">
                          {t.admin.newOrderPage.stepProductLabel}
                        </th>
                        <th className="min-w-0 px-2.5 py-2 align-bottom font-normal">
                          SKU
                        </th>
                        <th className="px-1 py-2 align-bottom text-center font-normal tabular-nums">
                          {t.admin.price}
                        </th>
                        <th className="w-[4.5rem] shrink-0 px-1 py-2 align-bottom text-center font-normal">
                          {t.upload.copiesLabel}
                        </th>
                        <th
                          className="min-w-0 py-2 pr-3 text-right align-bottom font-normal"
                          aria-hidden
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map((s) => {
                        const a = assignBySlot[s.id];
                        if (!a) return null;
                        const checked = selectedSlots.has(s.id);
                        const mugCat =
                          a.mugPick?.type === "catalog"
                            ? mugById.get(a.mugPick.productId)
                            : undefined;
                        const nbCat =
                          a.nbPick?.type === "catalog"
                            ? nbById.get(a.nbPick.productId)
                            : undefined;
                        const penCat =
                          a.penPick?.type === "catalog"
                            ? penById.get(a.penPick.productId)
                            : undefined;
                        const mugV = mugUploadOk[s.id];
                        const nbV = nbUploadOk[s.id];
                        const penV = penUploadOk[s.id];

                        const suggestedUnitMdl = catalogRetailUnitMdl(
                          a,
                          mugById,
                          nbById,
                          penById,
                        );
                        let pricePlaceholder =
                          suggestedUnitMdl != null
                            ? String(suggestedUnitMdl)
                            : "";
                        let lfBillingRollWidthM: number | null = null;
                        let lfBillingMaterialName: string | null = null;
                        let lfBillingDimsW: number | null = null;
                        let lfBillingDimsH: number | null = null;
                        const familyGroupSlot = lfFamilyGroupData.get(s.id);
                        if (a.productType === "large_format_print") {
                          const autoLf = familyGroupSlot
                            ? familyGroupSlot.slotTotalPriceMdl
                            : lfComputedLineTotalMdl(
                                a,
                                lfById,
                                lfMaterialItems,
                                lfPrintEconomicsPayload,
                                lfMinimumLineTotalMdlEffective,
                              );
                          pricePlaceholder =
                            autoLf > 0 ? String(autoLf) : "";

                          // Resolve billing roll for family-based pricing hint.
                          // Priority 1: the group's picked roll (guaranteed
                          // to match the layout diagram). Priority 2: per-slot
                          // cheapest via resolveFamilyPreviewMaterial (used
                          // when the slot isn't part of a resolved group yet).
                          if (autoLf > 0 && a.lfSelectionValue) {
                            const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
                            const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
                            const q = parseAdminCopiesInput(a.copiesStr);
                            if (Number.isFinite(w) && Number.isFinite(h) && q !== null && q > 0) {
                              const sel = parseSelectionValue(a.lfSelectionValue);
                              if (sel.type === "family") {
                                if (familyGroupSlot) {
                                  lfBillingRollWidthM = familyGroupSlot.billingRollWidthMeters;
                                  lfBillingMaterialName = familyGroupSlot.billingMaterialName;
                                  lfBillingDimsW = w;
                                  lfBillingDimsH = h;
                                } else {
                                  const billingMat = resolveFamilyPreviewMaterial({
                                    selectionValue: a.lfSelectionValue,
                                    materials: lfMaterialItems,
                                    printWidthCm: w,
                                    printHeightCm: h,
                                    quantity: q,
                                    customerType: a.lfCustomerType,
                                  });
                                  if (billingMat) {
                                    lfBillingRollWidthM = Number(billingMat.rollWidthMeters);
                                    lfBillingMaterialName = billingMat.name;
                                    lfBillingDimsW = w;
                                    lfBillingDimsH = h;
                                  }
                                }
                              }
                            }
                          }
                        }

                        const lk = wizardLineKey(s);
                        const wizardFileShownName =
                          s.file?.name ??
                          s.existingFile?.fileName ??
                          t.admin.newOrderPage.fileNotChosenPlaceholder;
                        const layoutFocusAnchor =
                          Boolean(
                            editOrderId &&
                              focusOrderLineParam &&
                              wizardLineKey(s) === focusOrderLineParam,
                          ) && firstSlotIdByLineKey.get(lk) === s.id;

                        return (
                          <tr
                            key={s.id}
                            id={
                              layoutFocusAnchor
                                ? "wizard-layout-focus"
                                : undefined
                            }
                            className="border-b border-gray-100"
                          >
                            <td className="min-w-0 py-2 pl-3 pr-2 align-top">
                              <div className="flex min-w-0 flex-col gap-1.5">
                                <div className="flex min-w-0 items-center gap-3">
                                  <input
                                    type="checkbox"
                                    className="size-4 shrink-0 accent-gold"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedSlots((prev) => {
                                        const n = new Set(prev);
                                        if (n.has(s.id)) n.delete(s.id);
                                        else n.add(s.id);
                                        return n;
                                      });
                                    }}
                                  />
                                  <span
                                    className="min-w-0 flex-1 truncate text-gray-900"
                                    title={wizardFileShownName}
                                  >
                                    {wizardFileShownName}
                                  </span>
                                </div>
                                {!(s.file || s.existingFile) ? (
                                  <FileDropzone
                                    onFiles={(files) => {
                                      const f = files[0];
                                      if (f) {
                                        setSlots((prev) =>
                                          prev.map((row) =>
                                            row.id === s.id
                                              ? { ...row, file: f }
                                              : row,
                                          ),
                                        );
                                      }
                                    }}
                                    ariaLabel={
                                      t.admin.newOrderPage.attachFileRowAriaLabel
                                    }
                                    className="ml-7 flex cursor-pointer rounded text-xs font-medium text-gold hover:text-amber-900"
                                    dragActiveClassName="bg-gold-light/50 outline-2 outline-dashed outline-gold"
                                  >
                                    <span>{t.admin.newOrderPage.attachFileRow}</span>
                                  </FileDropzone>
                                ) : null}
                                {editOrderId &&
                                  CATALOG_SKU_KIND_BY_PRODUCT[a.productType] && (
                                    <FileDropzone
                                      accept="image/*"
                                      onFiles={(files) => {
                                        const f = files[0];
                                        if (f) {
                                          setSlots((prev) =>
                                            prev.map((row) =>
                                              row.id === s.id
                                                ? { ...row, file: f }
                                                : row,
                                            ),
                                          );
                                        }
                                      }}
                                      ariaLabel={
                                        t.admin.newOrderPage
                                          .replaceLayoutImageAriaLabel
                                      }
                                      className="ml-7 flex cursor-pointer rounded text-xs font-medium text-gold hover:text-amber-900"
                                      dragActiveClassName="bg-gold-light/50 outline-2 outline-dashed outline-gold"
                                    >
                                      <span>
                                        {t.admin.newOrderPage.replaceLayoutImage}
                                      </span>
                                    </FileDropzone>
                                  )}
                              </div>
                            </td>
                            <td className="min-w-0 px-2.5 py-2 align-top">
                              <MenuSelect<ProductType>
                                className="w-full max-w-full min-w-0"
                                value={a.productType}
                                options={productTypeSelectOptions}
                                onChange={(pt) =>
                                  updateSlot(s.id, { productType: pt })
                                }
                                buttonClassName="text-sm w-full min-w-0 truncate px-3"
                              />
                            </td>
                            <td className="min-w-0 px-2.5 py-2 align-top">
                              {a.productType === "mug" && (
                                <div className="flex min-w-0 items-start gap-2.5 py-0.5">
                                  {a.mugPick?.type === "catalog" && mugCat ? (
                                    <CatalogSkuThumb
                                      imageUrl={mugCat.imagePublicUrl}
                                      fallbackColor={mugCat.bodyColorHex}
                                      title={mugProductDisplayName(
                                        mugCat,
                                        locale,
                                      )}
                                    />
                                  ) : null}
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0 flex-1">
                                        {a.mugPick?.type === "catalog" &&
                                        mugCat ? (
                                          <>
                                            <p className="truncate font-medium text-gray-950">
                                              {mugProductDisplayName(
                                                mugCat,
                                                locale,
                                              )}
                                            </p>
                                            <p className="truncate font-mono text-[11px] text-gray-500">
                                              {mugCat.sku}
                                            </p>
                                          </>
                                        ) : (
                                          <p className="text-sm text-gray-700">
                                            {t.mug.mugProductOtherLabel}
                                          </p>
                                        )}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 shrink-0 px-2 text-xs text-gold hover:bg-amber-50 hover:text-amber-900"
                                        onClick={() =>
                                          setCatalogSkuModalSlotId(s.id)
                                        }
                                      >
                                        {t.admin.newOrderPage.catalogSkuChangeProduct}
                                      </Button>
                                    </div>
                                    {a.mugPick?.type === "catalog" && mugCat ? (
                                      <div className="text-[10px] leading-snug">
                                        {mugV == null ? (
                                          <span className="text-gray-500">
                                            {t.admin.newOrderPage.layoutCheckPending}
                                          </span>
                                        ) : !mugV.ok ? (
                                          <span className="text-red-600">
                                            {t.admin.layoutValidation.sizeMismatch(
                                              mugV.expected.width,
                                              mugV.expected.height,
                                              mugV.actual.width,
                                              mugV.actual.height,
                                            )}
                                          </span>
                                        ) : (
                                          <span className="font-medium text-green-700">
                                            {t.admin.newOrderPage.layoutCheckOkShort}
                                          </span>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                              {a.productType === "notebook" && (
                                <div className="flex min-w-0 items-start gap-2.5 py-0.5">
                                  {a.nbPick?.type === "catalog" && nbCat ? (
                                    <CatalogSkuThumb
                                      imageUrl={nbCat.imagePublicUrl}
                                      fallbackColor={nbCat.coverColorHex}
                                      title={notebookProductDisplayName(
                                        nbCat,
                                        locale,
                                      )}
                                    />
                                  ) : null}
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0 flex-1">
                                        {a.nbPick?.type === "catalog" &&
                                        nbCat ? (
                                          <>
                                            <p className="truncate font-medium text-gray-950">
                                              {notebookProductDisplayName(
                                                nbCat,
                                                locale,
                                              )}
                                            </p>
                                            <p className="truncate font-mono text-[11px] text-gray-500">
                                              {nbCat.sku}
                                            </p>
                                          </>
                                        ) : (
                                          <p className="text-sm text-gray-700">
                                            {
                                              t.notebook
                                                .notebookProductOtherLabel
                                            }
                                          </p>
                                        )}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 shrink-0 px-2 text-xs text-gold hover:bg-amber-50 hover:text-amber-900"
                                        onClick={() =>
                                          setCatalogSkuModalSlotId(s.id)
                                        }
                                      >
                                        {t.admin.newOrderPage.catalogSkuChangeProduct}
                                      </Button>
                                    </div>
                                    {a.nbPick?.type === "catalog" && nbCat ? (
                                      <div className="text-[10px] leading-snug">
                                        {nbV == null ? (
                                          <span className="text-gray-500">
                                            {t.admin.newOrderPage.layoutCheckPending}
                                          </span>
                                        ) : !nbV.ok ? (
                                          <span className="text-red-600">
                                            {t.admin.layoutValidation.sizeMismatch(
                                              nbV.expected.width,
                                              nbV.expected.height,
                                              nbV.actual.width,
                                              nbV.actual.height,
                                            )}
                                          </span>
                                        ) : (
                                          <span className="font-medium text-green-700">
                                            {t.admin.newOrderPage.layoutCheckOkShort}
                                          </span>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                              {a.productType === "pen" && (
                                <div className="flex min-w-0 items-start gap-2.5 py-0.5">
                                  {a.penPick?.type === "catalog" && penCat ? (
                                    <CatalogSkuThumb
                                      imageUrl={penCat.imagePublicUrl}
                                      fallbackColor={penCat.bodyColorHex}
                                      title={penProductDisplayName(
                                        penCat,
                                        locale,
                                      )}
                                    />
                                  ) : null}
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0 flex-1">
                                        {a.penPick?.type === "catalog" &&
                                        penCat ? (
                                          <>
                                            <p className="truncate font-medium text-gray-950">
                                              {penProductDisplayName(
                                                penCat,
                                                locale,
                                              )}
                                            </p>
                                            <p className="truncate font-mono text-[11px] text-gray-500">
                                              {penCat.sku}
                                            </p>
                                          </>
                                        ) : (
                                          <p className="text-sm text-gray-700">
                                            {t.pen.penProductOtherLabel}
                                          </p>
                                        )}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 shrink-0 px-2 text-xs text-gold hover:bg-amber-50 hover:text-amber-900"
                                        onClick={() =>
                                          setCatalogSkuModalSlotId(s.id)
                                        }
                                      >
                                        {t.admin.newOrderPage.catalogSkuChangeProduct}
                                      </Button>
                                    </div>
                                    {a.penPick?.type === "catalog" && penCat ? (
                                      <div className="text-[10px] leading-snug">
                                        {penV == null ? (
                                          <span className="text-gray-500">
                                            {t.admin.newOrderPage.layoutCheckPending}
                                          </span>
                                        ) : !penV.ok ? (
                                          <span className="text-red-600">
                                            {t.admin.layoutValidation.sizeMismatch(
                                              penV.expected.width,
                                              penV.expected.height,
                                              penV.actual.width,
                                              penV.actual.height,
                                            )}
                                          </span>
                                        ) : (
                                          <span className="font-medium text-green-700">
                                            {t.admin.newOrderPage.layoutCheckOkShort}
                                          </span>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                              {a.productType === "large_format_print" && (
                                <div className="max-w-md space-y-2 py-0.5 text-sm">
                                  {lfMaterialItems.length === 0 ? (
                                    <p className="text-xs text-amber-800">
                                      {t.admin.lfMaterialCatalogSearchEmpty}
                                    </p>
                                  ) : (
                                    (() => {
                                      const wp = parseFloat(
                                        a.lfPrintWidthCmStr.replace(",", "."),
                                      );
                                      const hp = parseFloat(
                                        a.lfPrintHeightCmStr.replace(",", "."),
                                      );
                                      const dimsOk =
                                        Number.isFinite(wp) &&
                                        wp > 0 &&
                                        Number.isFinite(hp) &&
                                        hp > 0;
                                      // Family selection re-resolves to min-sufficient roll
                                      // once dims are known (same as server pickBillingRoll).
                                      const matCurrent = lfAdminPreviewMaterial(
                                        a,
                                        lfMaterialItems,
                                      );
                                      const resolvedMatId = matCurrent?.id
                                        ?? lfAdminSkuResolvedMaterialId(
                                          a.lfMaterialId,
                                          lfMaterialItems,
                                        );
                                      const billingResolved =
                                        dimsOk
                                          ? resolveFamilyPreviewMaterial({
                                              selectionValue:
                                                a.lfSelectionValue ??
                                                (a.lfMaterialId
                                                  ? `material:${a.lfMaterialId}`
                                                  : null),
                                              materials: lfMaterialItems,
                                              printWidthCm: wp,
                                              printHeightCm: hp,
                                              quantity:
                                                parseAdminCopiesInput(a.copiesStr) ?? 1,
                                              customerType: a.lfCustomerType,
                                            })
                                          : matCurrent;
                                      const dimInputWarn =
                                        Boolean(
                                          dimsOk &&
                                            billingResolved == null &&
                                            parseSelectionValue(
                                              a.lfSelectionValue ??
                                                (a.lfMaterialId
                                                  ? `material:${a.lfMaterialId}`
                                                  : null),
                                            ).type === "family",
                                        ) ||
                                        Boolean(
                                          matCurrent &&
                                            billingResolved &&
                                            lfSkuDimsExceedPrintable(
                                              billingResolved,
                                              a.lfPrintWidthCmStr,
                                              a.lfPrintHeightCmStr,
                                            ),
                                        );
                                      if (!matCurrent) {
                                        return (
                                          <p className="text-xs text-red-700">
                                            {t.admin.newOrderPage.lfMaterialLabel}: —
                                          </p>
                                        );
                                      }
                                      // Prefer the billing roll for layout/price when dims known.
                                      const matForLayout = billingResolved ?? matCurrent;
                                      const printableCm = lfSkuPrintableWidthCm(matForLayout);
                                      const fitsCross =
                                        dimsOk &&
                                        billingResolved != null &&
                                        lfPieceFitsAcrossPrintableWidthCm(wp, hp, printableCm);
                                      const qCop = parseAdminCopiesInput(a.copiesStr);
                                      let lfResult: ReturnType<typeof lfPricingFromSlotInputs> | null =
                                        null;
                                      const presetForPreview = lfActivePresetForSlot(
                                        { ...a, lfMaterialId: matForLayout.id },
                                        lfById,
                                      );
                                      if (fitsCross && qCop !== null) {
                                        lfResult = lfPricingFromSlotInputs({
                                          mat: matForLayout,
                                          printWidthCm: wp,
                                          printHeightCm: hp,
                                          quantity: qCop,
                                          customerType: a.lfCustomerType,
                                          sizePreset: presetForPreview
                                            ? { unitPriceMdl: presetForPreview.unitPriceMdl }
                                            : null,
                                          printEconomics: lfPrintEconomicsPayload,
                                          lfMinimumLineTotalMdl:
                                            lfMinimumLineTotalMdlEffective,
                                        });
                                      }
                                      const activePresets = (matForLayout.sizePresets ?? []).filter(
                                        (p) => p.isActive,
                                      );
                                      const presetLocked = presetForPreview != null;
                                      const PRESET_CUSTOM_VALUE = "__custom__";
                                      return (
                                        <>
                                          <div>
                                            <label className="mb-1 block text-[11px] font-medium text-gray-600">
                                              {t.admin.newOrderPage.lfMaterialLabel}
                                            </label>
                                            <MenuSelect<string>
                                              className="w-full"
                                              value={a.lfSelectionValue ?? `material:${resolvedMatId}`}
                                              options={lfMaterialOptions}
                                              onChange={(selectionValue) => {
                                                /** Switching material drops any preset selection (size list differs per material). */
                                                const sel = parseSelectionValue(selectionValue);
                                                // Representative id for initial state; family dims
                                                // re-resolve via resolveFamilyPreviewMaterial / sync effect.
                                                const opt = lfMaterialOptions.find((o: { value: string; materialId: string | null }) => o.value === selectionValue);
                                                let matId = opt?.materialId ?? null;
                                                if (sel.type === "family") {
                                                  const preview = resolveFamilyPreviewMaterial({
                                                    selectionValue,
                                                    materials: lfMaterialItems,
                                                    printWidthCm: Number.isFinite(wp) && wp > 0 ? wp : null,
                                                    printHeightCm: Number.isFinite(hp) && hp > 0 ? hp : null,
                                                    quantity: parseAdminCopiesInput(a.copiesStr),
                                                    customerType: a.lfCustomerType,
                                                  });
                                                  if (preview) matId = preview.id;
                                                }
                                                updateSlot(s.id, {
                                                  lfMaterialId: matId,
                                                  lfSelectionValue: selectionValue,
                                                  lfSizePresetId: null,
                                                });
                                              }}
                                            />
                                          </div>
                                          {activePresets.length > 0 ? (
                                            <div>
                                              <label className="mb-1 block text-[11px] font-medium text-gray-600">
                                                {t.admin.newOrderPage.lfSizePresetLabel}
                                              </label>
                                              <MenuSelect<string>
                                                className="w-full"
                                                value={a.lfSizePresetId ?? PRESET_CUSTOM_VALUE}
                                                options={[
                                                  ...activePresets.map((p) => ({
                                                    value: p.id,
                                                    label:
                                                      t.admin.newOrderPage.lfSizePresetOptionLabel(
                                                        p.widthCm,
                                                        p.heightCm,
                                                        a.lfCustomerType === "dealer"
                                                          ? p.dealerPriceMdl
                                                          : p.retailPriceMdl,
                                                      ),
                                                  })),
                                                  {
                                                    value: PRESET_CUSTOM_VALUE,
                                                    label:
                                                      t.admin.newOrderPage.lfSizePresetCustomOption,
                                                  },
                                                ]}
                                                onChange={(v) => {
                                                  if (v === PRESET_CUSTOM_VALUE) {
                                                    updateSlot(s.id, { lfSizePresetId: null });
                                                    return;
                                                  }
                                                  const picked = activePresets.find(
                                                    (p) => p.id === v,
                                                  );
                                                  if (!picked) return;
                                                  updateSlot(s.id, {
                                                    lfSizePresetId: picked.id,
                                                    lfPrintWidthCmStr: String(picked.widthCm),
                                                    lfPrintHeightCmStr: String(picked.heightCm),
                                                  });
                                                }}
                                              />
                                              {presetLocked ? (
                                                <p className="mt-1 text-[10px] leading-snug text-gray-500">
                                                  {t.admin.newOrderPage.lfSizePresetLockedHint}
                                                </p>
                                              ) : null}
                                            </div>
                                          ) : null}
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <label className="mb-0.5 block text-[11px] text-gray-600">
                                                {t.admin.newOrderPage.lfWidthCm}
                                              </label>
                                              <input
                                                className={cn(
                                                  "w-full rounded-md border px-2 py-1 text-sm",
                                                  dimInputWarn
                                                    ? "border-red-400 ring-1 ring-red-200"
                                                    : "border-gray-300",
                                                  presetLocked ? "bg-gray-100 text-gray-500" : "",
                                                )}
                                                aria-invalid={dimInputWarn}
                                                value={a.lfPrintWidthCmStr}
                                                readOnly={presetLocked}
                                                onChange={(e) =>
                                                  updateSlot(s.id, {
                                                    lfPrintWidthCmStr: e.target.value,
                                                  })
                                                }
                                              />
                                            </div>
                                            <div>
                                              <label className="mb-0.5 block text-[11px] text-gray-600">
                                                {t.admin.newOrderPage.lfHeightCm}
                                              </label>
                                              <input
                                                className={cn(
                                                  "w-full rounded-md border px-2 py-1 text-sm",
                                                  dimInputWarn
                                                    ? "border-red-400 ring-1 ring-red-200"
                                                    : "border-gray-300",
                                                  presetLocked ? "bg-gray-100 text-gray-500" : "",
                                                )}
                                                aria-invalid={dimInputWarn}
                                                value={a.lfPrintHeightCmStr}
                                                readOnly={presetLocked}
                                                onChange={(e) =>
                                                  updateSlot(s.id, {
                                                    lfPrintHeightCmStr: e.target.value,
                                                  })
                                                }
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <label className="mb-0.5 block text-[11px] text-gray-600">
                                              {t.admin.newOrderPage.lfCustomerType}
                                            </label>
                                            {/*
                                              Tier is set once at the order level
                                              (see AdminCustomerForm) and mirrored
                                              into every LF slot via effect. This
                                              readonly badge just shows the current
                                              tier so the row still makes sense.
                                            */}
                                            <div
                                              className={cn(
                                                "flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium",
                                                a.lfCustomerType === "dealer"
                                                  ? "border-amber-200 bg-amber-50 text-amber-900"
                                                  : "border-gray-200 bg-gray-50 text-gray-700",
                                              )}
                                              aria-label={t.admin.newOrderPage.lfCustomerType}
                                            >
                                              <span>
                                                {a.lfCustomerType === "dealer"
                                                  ? t.admin.newOrderPage.lfDealer
                                                  : t.admin.newOrderPage.lfRetail}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="mt-1 flex flex-col rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-[11px] leading-relaxed text-gray-800">
                                            <p className="text-[10px] text-gray-500">
                                              {t.admin.newOrderPage.lfRollNominalWidthM(
                                                matForLayout.rollWidthMeters,
                                              )}
                                            </p>
                                            <p className="text-[10px] text-gray-500">
                                              {t.admin.newOrderPage.lfEffectivePrintableWidthCm(
                                                printableCm,
                                              )}
                                            </p>
                                            <div className="mt-2 flex flex-col gap-1">
                                              {!dimsOk ? (
                                                <p className="text-[11px] text-gray-500">
                                                  {t.admin.newOrderPage.lfLfPreviewEnterDimensions}
                                                </p>
                                              ) : null}
                                              {dimsOk && !fitsCross ? (
                                                <p className="text-[11px] font-medium text-red-600">
                                                  {t.admin.newOrderPage.lfPrintExceedsPrintableWidthCm(
                                                    printableCm,
                                                    wp,
                                                    hp,
                                                  )}
                                                </p>
                                              ) : null}
                                              {dimsOk && fitsCross && qCop === null ? (
                                                <p className="text-[11px] text-gray-500">
                                                  {t.admin.newOrderPage.lfLfPreviewEnterCopies}
                                                </p>
                                              ) : null}
                                              {dimsOk &&
                                              fitsCross &&
                                              qCop !== null &&
                                              lfResult &&
                                              !lfResult.ok ? (
                                                <p className="text-[11px] font-medium text-red-600">
                                                  {lfResult.code === "quantity_too_large"
                                                    ? t.admin.newOrderPage.lfPackQuantityTooLarge(
                                                        LF_ROLL_PACK_MAX_QUANTITY,
                                                      )
                                                    : t.admin.newOrderPage.lfPackDoesNotFit}
                                                </p>
                                              ) : null}
                                              {dimsOk &&
                                              fitsCross &&
                                              qCop !== null &&
                                              lfResult &&
                                              lfResult.ok ? (
                                                <>
                                                  <p className="mt-1 text-[10px] text-gray-600">
                                                    {t.admin.newOrderPage.lfLinearMetersCalc(
                                                      lfResult.pricing.calculatedLinearMeters,
                                                    )}
                                                  </p>
                                                  <div className="pr-1">
                                                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                                      {lfBreakdownFullDetail ? (
                                                        <>
                                                          <span>{t.admin.newOrderPage.lfMatCost}</span>
                                                          <span className="text-right tabular-nums">
                                                            {lfResult.pricing.materialCost}{" "}
                                                            {t.admin.currency}
                                                          </span>
                                                          <span>{t.admin.newOrderPage.lfMatSell}</span>
                                                          <span className="text-right tabular-nums">
                                                            {lfResult.pricing.materialSellPrice}{" "}
                                                            {t.admin.currency}
                                                          </span>
                                                          {lfResult.minimumLineUpliftMdl > 0 &&
                                                          lfResult.lfMinimumLineFloorMdl != null ? (
                                                            <span className="col-span-2 text-[10px] leading-snug text-amber-900">
                                                              {t.admin.newOrderPage.lfMinimumLineUpliftNote(
                                                                lfResult.lfMinimumLineFloorMdl,
                                                                lfResult.minimumLineUpliftMdl,
                                                              )}
                                                            </span>
                                                          ) : null}
                                                          {lfResult.pricing.printSellPrice > 0 ? (
                                                            <>
                                                              <span>
                                                                {t.admin.newOrderPage.lfInkSellRevenue}
                                                              </span>
                                                              <span className="text-right tabular-nums">
                                                                {
                                                                  lfResult.pricing.printSellPrice
                                                                }{" "}
                                                                {t.admin.currency}
                                                              </span>
                                                            </>
                                                          ) : null}
                                                          <span className="font-semibold">
                                                            {t.admin.newOrderPage.lfTotal}
                                                          </span>
                                                          <span className="text-right font-semibold tabular-nums">
                                                            {lfResult.pricing.totalSellPrice}{" "}
                                                            {t.admin.currency}
                                                          </span>
                                                          {printEconomics &&
                                                          lfResult.rollEconomics ? (
                                                            (() => {
                                                              const econ = lfResult.rollEconomics;
                                                              const inkMult = lfInkMarkupMultiplierUsed(
                                                                a.lfCustomerType,
                                                                {
                                                                  lfInkRetailMarkupMultiplier:
                                                                    printEconomics.lfInkRetailMarkupMultiplier,
                                                                  lfInkDealerMarkupMultiplier:
                                                                    printEconomics.lfInkDealerMarkupMultiplier,
                                                                },
                                                              );
                                                              const estProfit =
                                                                lfResult.pricing.totalSellPrice -
                                                                econ.totalDirectCostMdl;
                                                              return (
                                                                <>
                                                                  <span>
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfInkMlUsed
                                                                    }
                                                                  </span>
                                                                  <span className="text-right tabular-nums">
                                                                    {econ.inkMlUsed.toLocaleString(locale)}
                                                                  </span>
                                                                  <span>
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfInkCostLabel
                                                                    }
                                                                  </span>
                                                                  <span className="text-right tabular-nums">
                                                                    {econ.inkCostMdl}{" "}
                                                                    {t.admin.currency}
                                                                  </span>
                                                                  {lfResult.pricing.printSellPrice > 0 ? (
                                                                    <>
                                                                      <span className="text-[10px] text-gray-600">
                                                                        {t.admin.newOrderPage.lfInkMarkupApplied(
                                                                          inkMult,
                                                                        )}
                                                                      </span>
                                                                      <span className="text-right text-[10px] text-gray-600 tabular-nums">
                                                                        —
                                                                      </span>
                                                                      <span className="text-[10px] text-gray-600">
                                                                        {
                                                                          t.admin.newOrderPage
                                                                            .lfInkEffectiveSellPerSqm
                                                                        }
                                                                      </span>
                                                                      <span className="text-right text-[10px] tabular-nums text-gray-800">
                                                                        {lfResult.inkSellPerSqmMdl}{" "}
                                                                        {t.admin.currency}
                                                                      </span>
                                                                    </>
                                                                  ) : inkMult <= 0 ? (
                                                                    <>
                                                                      <span className="col-span-2 text-[10px] text-gray-500">
                                                                        {
                                                                          t.admin.newOrderPage
                                                                            .lfInkSellOffHint
                                                                        }
                                                                      </span>
                                                                    </>
                                                                  ) : null}
                                                                  <span className="font-medium">
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfDirectCostLabel
                                                                    }
                                                                  </span>
                                                                  <span className="text-right font-medium tabular-nums">
                                                                    {econ.totalDirectCostMdl}{" "}
                                                                    {t.admin.currency}
                                                                  </span>
                                                                  <span>
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfMarginPercentLabel
                                                                    }
                                                                  </span>
                                                                  <span className="text-right tabular-nums text-emerald-800">
                                                                    {econ.marginPercent}%
                                                                  </span>
                                                                  <span>
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfEfficiencyLabel
                                                                    }
                                                                  </span>
                                                                  <span className="text-right tabular-nums">
                                                                    {econ.materialEfficiencyPct}%
                                                                  </span>
                                                                  <span>
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfEstProfitAfterDirect
                                                                    }
                                                                  </span>
                                                                  <span className="text-right tabular-nums text-emerald-800">
                                                                    {Math.round(estProfit)}{" "}
                                                                    {t.admin.currency}
                                                                  </span>
                                                                </>
                                                              );
                                                            })()
                                                          ) : (
                                                            <>
                                                              <span>{t.admin.newOrderPage.lfProfit}</span>
                                                              <span className="text-right tabular-nums text-emerald-800">
                                                                {lfResult.pricing.estimatedProfit}{" "}
                                                                {t.admin.currency}
                                                              </span>
                                                            </>
                                                          )}
                                                        </>
                                                      ) : (
                                                        <>
                                                          {lfResult.minimumLineUpliftMdl > 0 &&
                                                          lfResult.lfMinimumLineFloorMdl != null ? (
                                                            <span className="col-span-2 text-[10px] leading-snug text-amber-900">
                                                              {t.admin.newOrderPage.lfMinimumLineUpliftNote(
                                                                lfResult.lfMinimumLineFloorMdl,
                                                                lfResult.minimumLineUpliftMdl,
                                                              )}
                                                            </span>
                                                          ) : null}
                                                          {lfResult.rollEconomics != null ? (
                                                            <>
                                                              {lfResult.rollEconomics.usefulAreaSqm >
                                                              1e-9 ? (
                                                                <>
                                                                  <span>
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfUsefulPrintAreaSqmLabel
                                                                    }
                                                                  </span>
                                                                  <span className="text-right tabular-nums">
                                                                    {lfResult.rollEconomics.usefulAreaSqm.toFixed(
                                                                      2,
                                                                    )}{" "}
                                                                    m²
                                                                  </span>
                                                                  <span>
                                                                    {
                                                                      t.admin.newOrderPage
                                                                        .lfPricePerPrintedSqm
                                                                    }
                                                                  </span>
                                                                  <span className="text-right tabular-nums">
                                                                    {roundMoneyMdl(
                                                                      lfResult.pricing.totalSellPrice /
                                                                        lfResult.rollEconomics
                                                                          .usefulAreaSqm,
                                                                    )}{" "}
                                                                    {t.admin.currency}
                                                                  </span>
                                                                </>
                                                              ) : null}
                                                              <span>
                                                                {
                                                                  t.admin.newOrderPage
                                                                    .lfEfficiencyLabel
                                                                }
                                                              </span>
                                                              <span className="text-right tabular-nums">
                                                                {
                                                                  lfResult.rollEconomics
                                                                    .materialEfficiencyPct
                                                                }
                                                                %
                                                              </span>
                                                            </>
                                                          ) : null}
                                                          <span className="font-semibold">
                                                            {t.admin.newOrderPage.lfTotal}
                                                          </span>
                                                          <span className="text-right font-semibold tabular-nums">
                                                            {lfResult.pricing.totalSellPrice}{" "}
                                                            {t.admin.currency}
                                                          </span>
                                                        </>
                                                      )}
                                                    </div>
                                                  </div>
                                                </>
                                              ) : null}
                                            </div>
                                            <LfRollPackPreview
                                              title={
                                                familyGroupSlot
                                                  ? `${t.admin.newOrderPage.lfPackPreviewTitle} (${familyGroupSlot.groupSize} поз.)`
                                                  : t.admin.newOrderPage.lfPackPreviewTitle
                                              }
                                              emptyHint={
                                                t.admin.newOrderPage.lfPackPreviewPlaceholder
                                              }
                                              diagram={
                                                familyGroupSlot
                                                  ? familyGroupSlot.diagram
                                                  : lfResult?.ok
                                                    ? {
                                                        printableWidthCm:
                                                          lfResult.layout.printableWidthCm,
                                                        totalAlongCm:
                                                          lfResult.layout.totalAlongCm,
                                                        placements:
                                                          lfResult.layout.placements,
                                                      }
                                                    : undefined
                                              }
                                            />
                                          </div>
                                    </>
                                  );
                                  })()
                                  )}
                                </div>
                              )}
                              {a.productType === "business_card" && (
                                <AdminBusinessCardRowFields
                                  assign={a}
                                  papers={bcPaperItems}
                                  pricing={bcSlotPricing(
                                    a,
                                    bcPaperById,
                                    bcMinimumLineTotalMdlEffective,
                                  )}
                                  onChange={(patch) => updateSlot(s.id, patch)}
                                  t={t}
                                />
                              )}
                              {a.productType === "paper_print" &&
                                a.paperPrint && (
                                  <AdminPaperRowFields
                                    value={a.paperPrint}
                                    onChange={(pp) =>
                                      updateSlot(s.id, { paperPrint: pp })
                                    }
                                    t={t}
                                  />
                                )}
                            </td>
                            <td className="min-w-0 px-1 py-2 align-top text-center tabular-nums">
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  maxLength={12}
                                  aria-label={t.admin.price}
                                  placeholder={pricePlaceholder}
                                  className="w-full min-w-[4.75rem] max-w-[8rem] rounded-md border border-gray-300 px-2 py-1 text-center text-[13px] font-medium tabular-nums text-gray-900 placeholder:text-gray-400"
                                  value={a.linePriceStr}
                                  onChange={(e) =>
                                    updateSlot(s.id, {
                                      linePriceStr: sanitizeMoneyInput(
                                        e.target.value,
                                        { maxIntegerDigits: 9 },
                                      ),
                                    })
                                  }
                                />
                                {lfBillingRollWidthM !== null && (
                                  <>
                                    <span className="text-[10px] leading-tight text-gray-500">
                                      {t.cabinet.newOrder.lfBillingRollHint(lfBillingRollWidthM)}
                                    </span>
                                    {lfBillingMaterialName !== null && lfBillingDimsW !== null && lfBillingDimsH !== null && (
                                      <span className="text-[10px] leading-tight text-gray-500">
                                        {t.cabinet.newOrder.lfBillingMaterialHint(
                                          lfBillingMaterialName,
                                          lfBillingDimsW,
                                          lfBillingDimsH
                                        )}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="max-w-[4.75rem] px-1 py-2 align-top text-center">
                              <input
                                inputMode="numeric"
                                autoComplete="off"
                                maxLength={4}
                                className="mx-auto block w-full min-w-[3.75rem] max-w-[4.5rem] rounded-md border border-gray-300 px-2 py-1 text-center text-sm tabular-nums"
                                value={a.copiesStr}
                                onChange={(e) =>
                                  updateSlot(s.id, {
                                    copiesStr: e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="py-2 text-right align-top">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn(
                                  adminTableOutlineIconButtonClass,
                                  "border-red-100 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700",
                                )}
                                aria-label={
                                  t.admin.newOrderPage.removeFileAriaLabel
                                }
                                onClick={() => removeSlot(s.id)}
                              >
                                <Trash2
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden
                                />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50/30">
                        <td colSpan={3} className="py-2 pl-3" aria-hidden />
                        <td className="min-w-0 px-1 py-2 align-middle text-center tabular-nums">
                          <div
                            className="mx-auto inline-block rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-center"
                            aria-label={t.admin.newOrderPage.catalogLinesTotal}
                          >
                            <p className="text-base font-semibold tabular-nums text-gray-950 sm:text-lg">
                              {orderLinesSubtotalMdl > 0
                                ? formatAmountMdl(
                                    orderLinesSubtotalMdl,
                                    t.admin.currency,
                                  )
                                : "—"}
                            </p>
                          </div>
                        </td>
                        <td colSpan={2} className="py-2 pr-3" aria-hidden />
                      </tr>
                    </tfoot>
                  </table>
                  {printEconomics &&
                  (printEconomics.minimumOrderPriceMdl ?? 0) > 0 &&
                  orderLinesSubtotalMdl > 0 &&
                  orderLinesSubtotalMdl < (printEconomics.minimumOrderPriceMdl ?? 0) ? (
                    <p className="mt-2 text-center text-xs text-amber-800">
                      {t.admin.newOrderPage.lfMinimumOrderWarning(
                        printEconomics.minimumOrderPriceMdl ?? 0,
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}

        {step === "confirm" && (
          <MultiConfirmStep t={t} customer={customer} lines={lineSummaries()} />
        )}

        {editLoadError && (
          <p className="mt-4 text-sm text-red-600 text-center">{editLoadError}</p>
        )}
        {error && (
          <p className="mt-4 text-sm text-red-500 text-center">{error}</p>
        )}

        {step === "confirm" && uploadPhase !== "idle" && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">
                {uploadPhase === "creating"
                  ? editOrderId
                    ? t.admin.editOrderPage.saving
                    : t.admin.creatingOrder
                  : t.admin.newOrderPage.uploadProgressTitle}
              </span>
              {Object.keys(uploadStatuses).length > 0 && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {t.admin.newOrderPage.uploadProgressCount(
                    Object.values(uploadStatuses).filter((s) => s === "done")
                      .length,
                    Object.keys(uploadStatuses).length,
                  )}
                </span>
              )}
            </div>
            {Object.keys(uploadStatuses).length > 0 && (
              <ul className="space-y-1.5">
                {slots
                  .filter((s) => uploadStatuses[s.id] !== undefined)
                  .map((s) => {
                    const st = uploadStatuses[s.id] ?? "pending";
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        {st === "done" ? (
                          <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                        ) : st === "uploading" ? (
                          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-gray-500" />
                        ) : st === "error" ? (
                          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                        ) : (
                          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-gray-300" />
                        )}
                        <span
                          className={`truncate ${
                            st === "done"
                              ? "text-gray-500"
                              : st === "error"
                                ? "text-red-600"
                                : "text-gray-700"
                          }`}
                        >
                          {s.file?.name ?? s.existingFile?.fileName ?? "—"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {stepIndex > 0 && (
              <Button variant="outline" onClick={goBack} disabled={submitting}>
                {t.admin.newOrderPage.back}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:justify-end">
            {step !== "confirm" ? (
              <Button
                onClick={goNext}
                disabled={
                  !canAdvance() ||
                  submitting ||
                  Boolean(editOrderId && editPageBlocking)
                }
              >
                {t.admin.newOrderPage.next}
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={
                  !canAdvance() ||
                  submitting ||
                  Boolean(editOrderId && editPageBlocking)
                }
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {submitting
                  ? editOrderId
                    ? t.admin.editOrderPage.saving
                    : t.admin.creatingOrder
                  : editOrderId
                    ? t.admin.editOrderPage.save
                    : t.admin.createOrder}
              </Button>
            )}
          </div>
        </div>
        {editPageBlocking ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/95 text-gray-500"
          >
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            <span className="text-sm text-gray-600">{t.common.loading}</span>
          </div>
        ) : null}
      </div>
    </div>
      <CatalogSkuPickModal
        open={catalogSkuModalRow !== null}
        kind={catalogSkuModalRow?.kind ?? "mug"}
        locale={locale}
        t={t}
        mugItems={mugProductItems}
        notebookItems={notebookProductItems}
        penItems={penProductItems}
        mugValue={
          catalogSkuModalRow?.assign.mugPick?.type === "other"
            ? { type: "other" }
            : catalogSkuModalRow?.assign.mugPick?.type === "catalog"
              ? {
                  type: "catalog",
                  productId: catalogSkuModalRow.assign.mugPick.productId,
                }
              : null
        }
        notebookValue={
          catalogSkuModalRow?.assign.nbPick?.type === "other"
            ? { type: "other" }
            : catalogSkuModalRow?.assign.nbPick?.type === "catalog"
              ? {
                  type: "catalog",
                  productId: catalogSkuModalRow.assign.nbPick.productId,
                }
              : null
        }
        penValue={
          catalogSkuModalRow?.assign.penPick?.type === "other"
            ? { type: "other" }
            : catalogSkuModalRow?.assign.penPick?.type === "catalog"
              ? {
                  type: "catalog",
                  productId: catalogSkuModalRow.assign.penPick.productId,
                }
              : null
        }
        onSelectMug={(v) => {
          const row = catalogSkuModalRow;
          if (!row) return;
          if (v.type === "other") {
            updateSlot(row.slotId, { mugPick: { type: "other" } });
          } else {
            updateSlot(row.slotId, {
              mugPick: { type: "catalog", productId: v.productId },
            });
          }
        }}
        onSelectNotebook={(v) => {
          const row = catalogSkuModalRow;
          if (!row) return;
          if (v.type === "other") {
            updateSlot(row.slotId, { nbPick: { type: "other" } });
          } else {
            updateSlot(row.slotId, {
              nbPick: { type: "catalog", productId: v.productId },
            });
          }
        }}
        onSelectPen={(v) => {
          const row = catalogSkuModalRow;
          if (!row) return;
          if (v.type === "other") {
            updateSlot(row.slotId, { penPick: { type: "other" } });
          } else {
            updateSlot(row.slotId, {
              penPick: { type: "catalog", productId: v.productId },
            });
          }
        }}
        onClose={() => setCatalogSkuModalSlotId(null)}
      />
    </>
  );
}

function StepProgress({
  current,
  total,
  labels,
  formatLine,
}: {
  current: number;
  total: number;
  labels: string[];
  formatLine: (current: number, total: number) => string;
}) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const stepName = labels[current - 1] ?? "";
  const line = `${formatLine(current, total)} — ${stepName}`;

  return (
    <div className="space-y-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={line}
      >
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className="text-center text-[11px] sm:text-xs text-gray-600"
        aria-live="polite"
      >
        {line}
      </p>
    </div>
  );
}

function MultiConfirmStep({
  t,
  customer,
  lines,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  customer: CustomerFormValue;
  lines: Array<{ id: string; name: string; product: string; copies: string }>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          {t.admin.newOrderPage.confirmTitle}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t.admin.newOrderPage.confirmHint}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2">
                {t.admin.newOrderPage.confirmTableHeaderFile}
              </th>
              <th className="px-3 py-2">{t.admin.newOrderPage.stepProductLabel}</th>
              <th className="px-3 py-2 w-20">
                {t.admin.newOrderPage.confirmTableHeaderQty}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => (
              <tr key={row.id} className="border-b border-gray-100">
                <td className="max-w-xs truncate px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.product}</td>
                <td className="px-3 py-2 tabular-nums">{row.copies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-gray-200 p-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {t.common.phone}
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-800">
            {customer.phone || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {t.admin.clientName}
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-800">
            {customer.clientName || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {t.admin.price} ({t.admin.currency})
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-800">
            {customer.priceStr || "—"}
          </dd>
        </div>
        {customer.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-gray-400">
              {t.upload.notesLabel}
            </dt>
            <dd className="mt-1 text-sm whitespace-pre-line text-gray-800">
              {customer.notes}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * Shell component for the admin "New Order" / "Edit Order" wizard.
 *
 * The wizard depends on a sizeable catalog + economics bundle
 * ({@link WizardBootstrapData}) that previously came from SSR via
 * `loadWizardBootstrap()` during RSC render. To keep all admin pages on a
 * uniform "server = auth, client = data" pattern (see
 * `src/app/admin/(protected)/orders/new/page.tsx`), the bundle is now fetched
 * client-side from `/api/admin/wizard-bootstrap` on mount. While the request
 * is in flight we render a {@link PageSkeleton} instead of mounting the
 * heavyweight inner wizard, so we never need to thread a nullable
 * `bootstrap` through the rest of the component tree.
 */
export default function NewOrderPageClient(
  props: Omit<NewOrderPageClientProps, "bootstrap">,
) {
  const [bootstrap, setBootstrap] = useState<WizardBootstrapData | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/wizard-bootstrap")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || res.statusText);
        }
        return res.json() as Promise<WizardBootstrapData>;
      })
      .then((data) => {
        if (!cancelled) setBootstrap(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setBootstrapError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (bootstrapError) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
        <p
          role="alert"
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          {bootstrapError}
        </p>
      </main>
    );
  }

  if (!bootstrap) return <PageSkeleton variant="form" />;

  return <NewOrderWizard {...props} bootstrap={bootstrap} />;
}
