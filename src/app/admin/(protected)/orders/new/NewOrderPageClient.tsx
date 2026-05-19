"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  ProductType,
} from "@/lib/validations";
import {
  AdminCustomerForm,
  EMPTY_CUSTOMER_VALUE,
  parseAdminCopiesInput,
  type CustomerFormValue,
} from "@/app/admin/_components/orderForms";
import { uploadFile } from "@/app/admin/_components/orderForms/uploadHelpers";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import { mugProductDisplayName } from "@/lib/mug/mugProductLabels";
import { notebookProductDisplayName } from "@/lib/notebook/notebookProductLabels";
import { cn } from "@/lib/utils";
import { adminTableOutlineIconButtonClass } from "@/app/admin/_components/AdminTableIconActions";
import { CatalogSkuPickModal } from "@/app/admin/_components/CatalogSkuPickModal";
import {
  AdminPaperRowFields,
  type SlotPaperPrint,
} from "@/app/admin/_components/AdminPaperRowFields";
import { getPdfPageCount } from "@/app/admin/_lib/pdfPageCount";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { paperPrintFromStoredFile } from "./adminOrderWizardHydrate";
import {
  wizardLineKey,
  minimalUploadReadyMugLayout,
  minimalUploadReadyNotebookLayout,
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
import type { LfRollOrderEconomicsResult } from "@/lib/largeFormat/lfRollOrderEconomics";
import {
  LF_ROLL_PACK_MAX_QUANTITY,
  resolveEffectivePrintableWidthMeters,
} from "@/lib/largeFormat/largeFormatRollConstants";
import {
  computeLargeFormatRollLayout,
  type LargeFormatRollPackLayout,
} from "@/lib/largeFormat/largeFormatRollPack";
import type { AdminLargeFormatMaterialJson } from "@/lib/largeFormat/toAdminLargeFormatMaterialJson";
import type { WizardBootstrapData } from "@/lib/wizardBootstrap";
import type { LargeFormatCustomerType } from "@/lib/largeFormat/types";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { LfRollPackPreview } from "@/app/admin/_components/LfRollPackPreview";
import { lfPieceFitsAcrossPrintableWidthCm } from "@/lib/largeFormat/lfPieceFitsPrintableWidthCm";
import { isSuperAdmin } from "@/lib/roles";

function lfAdminSkuResolvedMaterialId(
  lfMaterialId: string | null,
  items: AdminLargeFormatMaterialJson[],
): string {
  return lfMaterialId && items.some((m) => m.id === lfMaterialId)
    ? lfMaterialId
    : items[0]!.id;
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

const STEP_ORDER: WizardStep[] = ["files", "confirm"];

const PRODUCT_OPTIONS: {
  id: ProductType;
  labelKey: "paper" | "mug" | "nb" | "lf";
}[] = [
  { id: "paper_print", labelKey: "paper" },
  { id: "mug", labelKey: "mug" },
  { id: "notebook", labelKey: "nb" },
  { id: "large_format_print", labelKey: "lf" },
];

interface NewOrderPageClientProps {
  /** Logged-in staff role (from server session) — drives LF pricing detail level. */
  staffRole: string;
  initialProduct: string | null;
  initialMode: string | null;
  fromInvoiceLineItemId?: string | null;
  initialClientId?: string | null;
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

type MugPick = { type: "catalog"; productId: string } | { type: "other" } | null;
type NbPick = { type: "catalog"; productId: string } | { type: "other" } | null;

interface SlotAssign {
  productType: ProductType;
  copiesStr: string;
  mugPick: MugPick;
  nbPick: NbPick;
  /** Mug/notebook: MDL per unit (× copies). Large format: optional full line total; empty = auto total. */
  linePriceStr: string;
  /** Set when `productType === "paper_print"`; cleared for mug/notebook rows */
  paperPrint: SlotPaperPrint | null;
  /** Preserved layout JSON for mug/notebook rows (esp. edit mode). */
  mugLayoutData?: MugLayoutData | null;
  notebookLayoutData?: NotebookLayoutData | null;
  /** DB JSON — used to resolve SKU selection after `/api/mug-products` loads. */
  mugProductSnapshot?: Record<string, unknown> | null;
  notebookProductSnapshot?: Record<string, unknown> | null;
  lfMaterialId: string | null;
  lfPrintWidthCmStr: string;
  lfPrintHeightCmStr: string;
  lfCustomerType: LargeFormatCustomerType;
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

function defaultAssign(
  mugItems: MugProductOption[],
  nbItems: NotebookProductOption[],
  lfDefaultMaterialId: string | null,
): SlotAssign {
  return {
    productType: "paper_print",
    copiesStr: "1",
    linePriceStr: "",
    paperPrint: defaultPaperPrint(),
    mugPick:
      mugItems.length > 0
        ? { type: "catalog", productId: mugItems[0]!.id }
        : { type: "other" },
    nbPick:
      nbItems.length > 0
        ? { type: "catalog", productId: nbItems[0]!.id }
        : { type: "other" },
    lfMaterialId: lfDefaultMaterialId,
    lfPrintWidthCmStr: "100",
    lfPrintHeightCmStr: "100",
    lfCustomerType: "retail",
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
): number | null {
  if (a.productType === "mug" && a.mugPick?.type === "catalog") {
    const p = mugById.get(a.mugPick.productId);
    const price = p?.sellPrice;
    if (price != null && Number.isFinite(Number(price))) {
      return Math.round(Number(price));
    }
    return null;
  }
  if (a.productType === "notebook" && a.nbPick?.type === "catalog") {
    const p = nbById.get(a.nbPick.productId);
    const price = p?.sellPrice;
    if (price != null && Number.isFinite(Number(price))) {
      return Math.round(Number(price));
    }
    return null;
  }
  return null;
}

function parsedLinePriceMdl(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
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
  const pack = computeLargeFormatRollLayout({
    printableWidthCm,
    nominalRollWidthMeters: Number(opts.mat.rollWidthMeters),
    printWidthCm: opts.printWidthCm,
    printHeightCm: opts.printHeightCm,
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

  const pe = opts.printEconomics;
  if (
    pe &&
    Number.isFinite(pe.inkMlPerSqmLargeFormatRoll) &&
    pe.inkMlPerSqmLargeFormatRoll >= 0 &&
    Number.isFinite(pe.avgInkCostPerMlMdl) &&
    pe.avgInkCostPerMlMdl >= 0
  ) {
    const econCosts = computeLfRollOrderEconomics({
      printWidthCm: opts.printWidthCm,
      printHeightCm: opts.printHeightCm,
      quantity: opts.quantity,
      calculatedLinearMeters: pack.layout.calculatedLinearMeters,
      rollWidthMeters: Number(opts.mat.rollWidthMeters),
      effectiveMaterialCostPerLinearMeterMdl: effCostLm,
      inkMlPerSqm: pe.inkMlPerSqmLargeFormatRoll,
      avgInkCostPerMlMdl: pe.avgInkCostPerMlMdl,
      totalSellPriceMdl: pricingMat.materialSellPrice,
    });
    econCostsAfterInk = econCosts;
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

  const minFloor =
    Number.isFinite(opts.lfMinimumLineTotalMdl) && opts.lfMinimumLineTotalMdl > 0
      ? Math.round(opts.lfMinimumLineTotalMdl)
      : 0;
  const { pricing: pricingAfterMin, upliftMdl: minimumLineUpliftMdl } =
    applyLfMinimumLineSellTotalMdl(pricing, minFloor);

  pricing = pricingAfterMin;
  const lfMinimumLineFloorMdl =
    minimumLineUpliftMdl > 0 && minFloor > 0 ? minFloor : null;

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

function lfComputedLineTotalMdl(
  a: SlotAssign,
  lfById: Map<string, AdminLargeFormatMaterialJson>,
  lfPrintEconomics: Parameters<typeof lfPricingFromSlotInputs>[0]["printEconomics"],
  lfMinimumLineTotalMdl: number,
): number {
  if (a.productType !== "large_format_print") return 0;
  if (!a.lfMaterialId) return 0;
  const m = lfById.get(a.lfMaterialId);
  if (!m) return 0;
  const q = parseAdminCopiesInput(a.copiesStr);
  if (q === null || q < 1) return 0;
  const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
  const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return 0;
  const lf = lfPricingFromSlotInputs({
    mat: m,
    printWidthCm: w,
    printHeightCm: h,
    quantity: q,
    customerType: a.lfCustomerType,
    printEconomics: lfPrintEconomics,
    lfMinimumLineTotalMdl,
  });
  if (!lf.ok) return 0;
  return lf.pricing.totalSellPrice;
}

function effectiveLineTotalMdl(
  a: SlotAssign,
  mugById: Map<string, MugProductOption>,
  nbById: Map<string, NotebookProductOption>,
  lfById: Map<string, AdminLargeFormatMaterialJson>,
  lfPrintEconomics: Parameters<typeof lfPricingFromSlotInputs>[0]["printEconomics"],
  lfMinimumLineTotalMdl: number,
): number {
  if (a.productType === "large_format_print") {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    return lfComputedLineTotalMdl(a, lfById, lfPrintEconomics, lfMinimumLineTotalMdl);
  }
  const cop = parseAdminCopiesInput(a.copiesStr);
  const copN = cop === null ? 0 : cop;
  const parsedUnit = parsedLinePriceMdl(a.linePriceStr);
  const catalogUnit = catalogRetailUnitMdl(a, mugById, nbById);
  const unit = parsedUnit ?? catalogUnit;
  if (unit === null) return 0;
  return Math.round(Number(unit) * copN);
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

async function buildAdminOrderUpdateLines(
  slots: AdminWizardSlot[],
  assignBySlot: Record<string, SlotAssign>,
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

      if (slot.file) {
        const { fileName, fileUrl } = await uploadFile(slot.file);
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
        } else if (a.productType === "mug") {
          const mugCopies = parseAdminCopiesInput(a.copiesStr);
          if (mugCopies === null) throw new Error("Invalid copies");
          files.push({
            fileName,
            fileUrl,
            copies: mugCopies,
            color: "color",
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
        } else if (a.productType === "notebook") {
          const nbCopies = parseAdminCopiesInput(a.copiesStr);
          if (nbCopies === null) throw new Error("Invalid copies");
          files.push({
            fileName,
            fileUrl,
            copies: nbCopies,
            color: "color",
          });
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
        } else if (a.productType === "mug") {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: "color",
          });
        } else if (a.productType === "large_format_print") {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: "color",
            paperType: "large_format",
          });
        } else if (a.productType === "notebook") {
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
          : undefined,
      customerType:
        baseAssign.productType === "large_format_print"
          ? baseAssign.lfCustomerType
          : undefined,
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

export default function NewOrderPageClient(props: NewOrderPageClientProps) {
  const {
    staffRole,
    fromInvoiceLineItemId = null,
    initialClientId = null,
    editOrderId = null,
    bootstrap,
  } = props;
  const lfBreakdownFullDetail = isSuperAdmin(staffRole);
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusOrderLineParam = searchParams.get("line");
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
  const lfMaterialItems = bootstrap.lfMaterials;

  const mugProductItemsRef = useRef<MugProductOption[]>(mugProductItems);
  const notebookProductItemsRef = useRef<NotebookProductOption[]>(
    notebookProductItems,
  );
  mugProductItemsRef.current = mugProductItems;
  notebookProductItemsRef.current = notebookProductItems;
  const lfMaterialItemsRef = useRef<AdminLargeFormatMaterialJson[]>(lfMaterialItems);
  lfMaterialItemsRef.current = lfMaterialItems;

  const printEconomics: {
    inkMlPerSqmLargeFormatRoll: number;
    minimumOrderPriceMdl: number | null;
    avgInkCostPerMlMdl: number;
    inkStockMl: number;
    lfInkRetailMarkupMultiplier: number;
    lfInkDealerMarkupMultiplier: number;
    lfMinimumLineTotalMdl: number;
  } | null = bootstrap.printEconomics;

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [editLoading, setEditLoading] = useState(Boolean(editOrderId));
  const [editLoadError, setEditLoadError] = useState("");
  const [mugUploadOk, setMugUploadOk] = useState<
    Record<string, SizeValidationResult | null>
  >({});
  const [nbUploadOk, setNbUploadOk] = useState<
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
            largeFormatMaterialId?: string | null;
            largeFormatLineData?: unknown;
            mugProductSnapshot?: unknown;
            notebookProductSnapshot?: unknown;
            mugLayoutData: unknown;
            notebookLayoutData: unknown;
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

        const lines = [...order.orderLines].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        );
        const nextSlots: AdminWizardSlot[] = [];
        const nextAssign: Record<string, SlotAssign> = {};

        for (const line of lines) {
          const rowFiles = [...line.files].sort((a, b) =>
            a.fileName.localeCompare(b.fileName),
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
              lfMaterialItemsRef.current[0]?.id ?? null,
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
            if (pt === "large_format_print") {
              const lfd = parseLargeFormatLineData(line.largeFormatLineData);
              base.lfMaterialId =
                line.largeFormatMaterialId ?? lfd?.materialSnapshot.id ?? null;
              if (lfd) {
                base.copiesStr = String(lfd.quantity);
                base.lfPrintWidthCmStr = String(lfd.printWidthCm);
                base.lfPrintHeightCmStr = String(lfd.printHeightCm);
                base.lfCustomerType = lfd.customerType;
              }
            }
            nextAssign[sid] = base;
          }
        }

        setSlots(nextSlots);
        setAssignBySlot(nextAssign);
        setCustomer({
          ...EMPTY_CUSTOMER_VALUE,
          phone: order.phone,
          clientName: order.clientName ?? "",
          notes: order.notes ?? "",
          priceStr: order.price != null ? String(order.price) : "",
          selectedClient: order.studioClient ?? null,
        });
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
            lfMaterialItems[0]?.id ?? null,
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
  }, [slots, mugProductItems, notebookProductItems, lfMaterialItems]);

  useEffect(() => {
    syncAssignForSlots();
  }, [syncAssignForSlots]);

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

  const editPageBlocking =
    Boolean(editOrderId) && !editLoadError && editLoading;

  const orderLinesSubtotalMdl = useMemo(() => {
    let sum = 0;
    for (const s of slots) {
      const a = assignBySlot[s.id];
      if (!a) continue;
      sum += effectiveLineTotalMdl(
        a,
        mugById,
        nbById,
        lfById,
        lfPrintEconomicsPayload,
        lfMinimumLineTotalMdlEffective,
      );
    }
    return sum;
  }, [
    slots,
    assignBySlot,
    mugById,
    nbById,
    lfById,
    lfPrintEconomicsPayload,
    lfMinimumLineTotalMdlEffective,
  ]);

  useEffect(() => {
    if (editOrderId) {
      if (editPageBlocking) return;
      if (slots.length === 0) return;
      if (slots.some((s) => !assignBySlot[s.id])) return;
    }
    const digits =
      orderLinesSubtotalMdl > 0
        ? String(Math.round(orderLinesSubtotalMdl))
        : "";
    setCustomer((prev) => {
      if (prev.priceStr === digits) return prev;
      return { ...prev, priceStr: digits };
    });
  }, [
    orderLinesSubtotalMdl,
    editOrderId,
    editPageBlocking,
    slots,
    assignBySlot,
  ]);

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
    if (
      !a ||
      (a.productType !== "mug" && a.productType !== "notebook")
    ) {
      return null;
    }
    return { slotId: catalogSkuModalSlotId, assign: a };
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
        label:
          o.labelKey === "paper"
            ? t.mug.productPaperPrint
            : o.labelKey === "mug"
              ? t.mug.productMug
              : o.labelKey === "lf"
                ? t.admin.productTypeLargeFormat
                : t.notebook.productNotebook,
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
          lfMaterialItems[0]?.id ?? null,
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
      if (prev.length >= 10) return prev;
      return [{ id: newSlotId(), sourceOrderLineId: null }, ...prev];
    });
  }

  function canAdvance(): boolean {
    if (step === "files") {
      if (slots.length < 1 || slots.length > 10) return false;
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
        if (a.productType === "large_format_print") {
          if (!a.lfMaterialId) return false;
          const mat = lfMaterialItems.find((m) => m.id === a.lfMaterialId);
          if (!mat) return false;
          const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
          const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
          if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0)
            return false;
          const printableCm =
            resolveEffectivePrintableWidthMeters({
              printableWidthMeters: mat.printableWidthMeters,
              rollWidthMeters: mat.rollWidthMeters,
            }) * 100;
          if (!lfPieceFitsAcrossPrintableWidthCm(w, h, printableCm)) return false;
          const lfCheck = lfPricingFromSlotInputs({
            mat,
            printWidthCm: w,
            printHeightCm: h,
            quantity: cop,
            customerType: a.lfCustomerType,
            printEconomics: lfPrintEconomicsPayload,
            lfMinimumLineTotalMdl: lfMinimumLineTotalMdlEffective,
          });
          if (!lfCheck.ok) return false;
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
      const mugN: Record<string, SizeValidationResult | null> = {};
      const nbN: Record<string, SizeValidationResult | null> = {};
      for (const s of slots) {
        const a = assignBySlot[s.id];
        if (!a) continue;

        if (a.productType === "mug" && a.mugPick?.type === "catalog") {
          const p = mugById.get(a.mugPick.productId);
          if (!p) {
            mugN[s.id] = null;
          } else {
            const expected = {
              width: cmToPx(p.printWidthCm, p.printDpi),
              height: cmToPx(p.printHeightCm, p.printDpi),
            };
            if (!s.file && s.existingFile) {
              mugN[s.id] = await validateLayoutFromExistingServerFile(
                s.existingFile.id,
                expected,
              );
              if (cancelled) return;
            } else if (s.file) {
              try {
                const actual = await getImageDimensions(s.file);
                mugN[s.id] = validateLayoutSize(actual, expected);
              } catch {
                mugN[s.id] = {
                  ok: false,
                  expected,
                  actual: { width: 0, height: 0 },
                  tolerance: 0.02,
                };
              }
            } else {
              mugN[s.id] = null;
            }
          }
        } else {
          mugN[s.id] = null;
        }

        if (a.productType === "notebook" && a.nbPick?.type === "catalog") {
          const p = nbById.get(a.nbPick.productId);
          if (!p) {
            nbN[s.id] = null;
          } else {
            const expected = {
              width: cmToPx(Number(p.printWidthCm), p.printDpi),
              height: cmToPx(Number(p.printHeightCm), p.printDpi),
            };
            if (!s.file && s.existingFile) {
              nbN[s.id] = await validateLayoutFromExistingServerFile(
                s.existingFile.id,
                expected,
              );
              if (cancelled) return;
            } else if (s.file) {
              try {
                const actual = await getImageDimensions(s.file);
                nbN[s.id] = validateLayoutSize(actual, expected);
              } catch {
                nbN[s.id] = {
                  ok: false,
                  expected,
                  actual: { width: 0, height: 0 },
                  tolerance: 0.02,
                };
              }
            } else {
              nbN[s.id] = null;
            }
          }
        } else {
          nbN[s.id] = null;
        }
      }
      if (!cancelled) {
        setMugUploadOk(mugN);
        setNbUploadOk(nbN);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, slots, assignBySlot, mugById, nbById]);

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
      const priceVal = customer.priceStr.trim()
        ? parseInt(customer.priceStr, 10)
        : null;
      const priceField =
        Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : undefined;

      if (editOrderId) {
        const patchAssign = applyMinimalLayoutJsonWhenNewUpload(
          slots,
          assignBySlot,
        );
        const lines = await buildAdminOrderUpdateLines(slots, patchAssign);
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
          const pv = parseInt(trimmedPrice, 10);
          if (Number.isFinite(pv) && pv >= 0) patchBody.price = pv;
        }
        const res = await fetch(`/api/admin/orders/${editOrderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Failed to update order");
        }
        router.push("/admin/orders");
        router.refresh();
        navigated = true;
        return;
      }

      const lines: AdminOrderLineInput[] = [];

      for (const slot of slots) {
        const a = assignBySlot[slot.id];
        if (!a) throw new Error("Missing row config");
        const localFile = slot.file;
        if (!localFile) throw new Error("Missing file");

        if (a.productType === "paper_print") {
          const paperCopies = parseAdminCopiesInput(a.copiesStr);
          if (paperCopies === null) throw new Error("Invalid copies");
          const pp = a.paperPrint;
          if (!pp) throw new Error("Paper options missing");
          const { fileName, fileUrl } = await uploadFile(localFile);
          lines.push({
            productType: "paper_print",
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
          if (!a.lfMaterialId) throw new Error("Material required");
          const { fileName, fileUrl } = await uploadFile(localFile);
          lines.push({
            productType: "large_format_print",
            largeFormatMaterialId: a.lfMaterialId,
            printWidthCm: w,
            printHeightCm: h,
            quantity: qty,
            customerType: a.lfCustomerType,
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
            files: [{ fileName, fileUrl, copies: nbCopies, color: "color" }],
          });
        } else {
          throw new Error("Unknown product type");
        }
      }

      await createAdminOrder({
        phone: customer.phone,
        clientName: customer.clientName.trim() || undefined,
        clientId: customer.selectedClient?.id,
        notes: customer.notes.trim() || undefined,
        price: priceField,
        lines,
        fromInvoiceLineItemId: fromInvoiceLineItemId ?? undefined,
      });

      router.push("/admin/orders");
      router.refresh();
      navigated = true;
    } catch (err) {
      setError(formatLfAdminOrderSaveError(err, t.admin.newOrderPage));
    } finally {
      submittingRef.current = false;
      // Keep the spinner up while the new RSC payload streams in;
      // resetting `submitting` here would briefly re-enable the
      // submit button mid-navigation and let a quick second click
      // fire a duplicate order.
      if (!navigated) setSubmitting(false);
    }
  }

  function onFilesPick(list: FileList | File[]): void {
    const arr = Array.from(list).slice(0, 10);
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
          if (merged.length + newRows.length >= 10) break;
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
          lfMaterialItems[0]?.id ?? null,
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
      else if (a?.productType === "large_format_print")
        product = t.admin.productTypeLargeFormat;
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
            href="/admin/orders"
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
                {t.admin.newOrderPage.fileUploadHint}
              </p>
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
                  {slots.length}/10
                </span>
              </label>
            </div>
              </div>

              <div className="lg:col-span-9">
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
                    disabled={slots.length >= 10}
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
                        const mugV = mugUploadOk[s.id];
                        const nbV = nbUploadOk[s.id];

                        const suggestedUnitMdl = catalogRetailUnitMdl(
                          a,
                          mugById,
                          nbById,
                        );
                        let pricePlaceholder =
                          suggestedUnitMdl != null
                            ? String(suggestedUnitMdl)
                            : "";
                        if (a.productType === "large_format_print") {
                          const autoLf = lfComputedLineTotalMdl(
                            a,
                            lfById,
                            lfPrintEconomicsPayload,
                            lfMinimumLineTotalMdlEffective,
                          );
                          pricePlaceholder =
                            autoLf > 0 ? String(autoLf) : "";
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
                                  <label className="ml-7 flex cursor-pointer text-xs font-medium text-gold hover:text-amber-900">
                                    <input
                                      type="file"
                                      className="sr-only"
                                      aria-label={
                                        t.admin.newOrderPage.attachFileRowAriaLabel
                                      }
                                      onChange={(ev) => {
                                        const f = ev.target.files?.[0];
                                        if (f) {
                                          setSlots((prev) =>
                                            prev.map((row) =>
                                              row.id === s.id
                                                ? { ...row, file: f }
                                                : row,
                                            ),
                                          );
                                        }
                                        ev.target.value = "";
                                      }}
                                    />
                                    <span>{t.admin.newOrderPage.attachFileRow}</span>
                                  </label>
                                ) : null}
                                {editOrderId &&
                                  (a.productType === "mug" ||
                                    a.productType === "notebook") && (
                                    <label className="ml-7 flex cursor-pointer text-xs font-medium text-gold hover:text-amber-900">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        aria-label={
                                          t.admin.newOrderPage
                                            .replaceLayoutImageAriaLabel
                                        }
                                        onChange={(ev) => {
                                          const f = ev.target.files?.[0];
                                          if (f) {
                                            setSlots((prev) =>
                                              prev.map((row) =>
                                                row.id === s.id
                                                  ? { ...row, file: f }
                                                  : row,
                                              ),
                                            );
                                          }
                                          ev.target.value = "";
                                        }}
                                      />
                                      <span>
                                        {t.admin.newOrderPage.replaceLayoutImage}
                                      </span>
                                    </label>
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
                              {a.productType === "large_format_print" && (
                                <div className="max-w-md space-y-2 py-0.5 text-sm">
                                  {lfMaterialItems.length === 0 ? (
                                    <p className="text-xs text-amber-800">
                                      {t.admin.lfMaterialCatalogSearchEmpty}
                                    </p>
                                  ) : (
                                    (() => {
                                      const resolvedMatId = lfAdminSkuResolvedMaterialId(
                                        a.lfMaterialId,
                                        lfMaterialItems,
                                      );
                                      const matCurrent = lfById.get(resolvedMatId);
                                      const dimInputWarn =
                                        Boolean(
                                          matCurrent &&
                                            lfSkuDimsExceedPrintable(
                                              matCurrent,
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
                                      const printableCm = lfSkuPrintableWidthCm(matCurrent);
                                      const fitsCross =
                                        dimsOk &&
                                        lfPieceFitsAcrossPrintableWidthCm(wp, hp, printableCm);
                                      const qCop = parseAdminCopiesInput(a.copiesStr);
                                      let lfResult: ReturnType<typeof lfPricingFromSlotInputs> | null =
                                        null;
                                      if (fitsCross && qCop !== null) {
                                        lfResult = lfPricingFromSlotInputs({
                                          mat: matCurrent,
                                          printWidthCm: wp,
                                          printHeightCm: hp,
                                          quantity: qCop,
                                          customerType: a.lfCustomerType,
                                          printEconomics: lfPrintEconomicsPayload,
                                          lfMinimumLineTotalMdl:
                                            lfMinimumLineTotalMdlEffective,
                                        });
                                      }
                                      return (
                                        <>
                                          <div>
                                            <label className="mb-1 block text-[11px] font-medium text-gray-600">
                                              {t.admin.newOrderPage.lfMaterialLabel}
                                            </label>
                                            <MenuSelect<string>
                                              className="w-full"
                                              value={resolvedMatId}
                                              options={lfMaterialItems.map((m) => ({
                                                value: m.id,
                                                label: m.name,
                                              }))}
                                              onChange={(id) =>
                                                updateSlot(s.id, { lfMaterialId: id })
                                              }
                                            />
                                          </div>
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
                                                )}
                                                aria-invalid={dimInputWarn}
                                                value={a.lfPrintWidthCmStr}
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
                                                )}
                                                aria-invalid={dimInputWarn}
                                                value={a.lfPrintHeightCmStr}
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
                                            <MenuSelect<LargeFormatCustomerType>
                                              className="w-full"
                                              value={a.lfCustomerType}
                                              options={[
                                                {
                                                  value: "retail",
                                                  label: t.admin.newOrderPage.lfRetail,
                                                },
                                                {
                                                  value: "dealer",
                                                  label: t.admin.newOrderPage.lfDealer,
                                                },
                                              ]}
                                              onChange={(v) =>
                                                updateSlot(s.id, { lfCustomerType: v })
                                              }
                                            />
                                          </div>
                                          <div className="mt-1 flex flex-col rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-[11px] leading-relaxed text-gray-800">
                                            <p className="text-[10px] text-gray-500">
                                              {t.admin.newOrderPage.lfRollNominalWidthM(
                                                matCurrent.rollWidthMeters,
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
                                              title={t.admin.newOrderPage.lfPackPreviewTitle}
                                              emptyHint={
                                                t.admin.newOrderPage.lfPackPreviewPlaceholder
                                              }
                                              diagram={
                                                lfResult?.ok
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
                              <div className="flex justify-center">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  maxLength={9}
                                  aria-label={t.admin.price}
                                  placeholder={pricePlaceholder}
                                  className="w-full min-w-[4.75rem] max-w-[8rem] rounded-md border border-gray-300 px-2 py-1 text-center text-[13px] font-medium tabular-nums text-gray-900 placeholder:text-gray-400"
                                  value={a.linePriceStr}
                                  onChange={(e) =>
                                    updateSlot(s.id, {
                                      linePriceStr: e.target.value
                                        .replace(/\D/g, "")
                                        .slice(0, 9),
                                    })
                                  }
                                />
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
                                ? `${orderLinesSubtotalMdl} ${t.admin.currency}`
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
        kind={catalogSkuModalRow?.assign.productType === "notebook" ? "notebook" : "mug"}
        locale={locale}
        t={t}
        mugItems={mugProductItems}
        notebookItems={notebookProductItems}
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
