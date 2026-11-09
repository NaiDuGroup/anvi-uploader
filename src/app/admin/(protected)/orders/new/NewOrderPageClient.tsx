"use client";

import { marginPercentOnCostBasis, sellOnCostBasis } from "@/lib/accounting/vatBasis";
import { SHOP_ORDER_EDIT_BLOCKED_MESSAGE } from "@/lib/shop/orderFlags";
import { GIFT_SET_CATEGORY_CODE } from "@/lib/giftSet/giftSetCategory";
import {
  isGiftSetBoxLineType,
  isLegacyReadySetLine,
  parseOrderLineSetData,
  readyZoneLineType,
  type GiftSetRole,
  type GiftSetTemplate,
  type GiftSetZone,
} from "@/lib/giftSet/giftSet";
import { readySetUvDescription, readyZoneExpectedPx } from "@/lib/giftSet/giftSetReadyLines";
import {
  giftSetBoxRows,
  giftSetGroupSlotIds,
  giftSetLineInput,
  withGiftSetBoxLines,
  giftSetReservedStock,
  giftSetSavedHeldMap,
  giftSetItemAlt,
  placeGiftSetRows,
  giftSetSwatchHex,
  giftSetRowFromLine,
  giftSetRowPlans,
  giftSetRowTotals,
  giftSetRowKeepsSet,
  dissolveGiftSetAssigns,
  type GiftSetCatalogs,
  type GiftSetChoice,
  type GiftSetBoxRow,
  type GiftSetRowAssign,
} from "@/lib/giftSet/giftSetWizard";
import { GiftSetItemThumb } from "@/components/orders/GiftSetItemThumb";
import { procurementVariantIds } from "@/lib/giftSet/giftSetBoard";
import { readySetRowLine } from "./giftSetLines";
import { GiftSetDialog } from "@/app/admin/_components/GiftSetDialog";
import { GiftSetBadge } from "@/components/orders/GiftSetBadge";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { PRODUCT_TYPE_ICONS } from "@/lib/productTypeIcons";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, Flame, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
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
import { resolveR2Key, uploadFile, type UploadResult } from "@/app/admin/_components/orderForms/uploadHelpers";
import { WizardLibraryPickButton, WizardReuseInfo, WizardMissingFileNote, WizardExpiredPhotosNote } from "@/app/admin/_components/library/WizardLibraryParts";
import { LibraryPickerDialog } from "@/app/admin/_components/library/LibraryPickerDialog";
import type { LibraryItem } from "@/app/admin/_components/library/libraryClient";
import {
  loadRepeatOrderFiles,
  reuseFromLibraryItem,
  type WizardReusedFile,
} from "@/app/admin/_components/library/wizardReuse";
import { buildDesignFileName } from "@/lib/design/fileName";
import { withoutMissingLayoutPhotos } from "./repeatOrder";
import type { DesignListItemJson } from "@/lib/design/designJson";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import type { PenProductOption } from "@/app/pen/_components/PenProductPicker";
import { penLineTotalMdl } from "@/lib/pen/penLineTotal";
import { cn } from "@/lib/utils";
import { getProductTypeConfig } from "@/lib/productTypes";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import { adminTableOutlineIconButtonClass } from "@/app/admin/_components/AdminTableIconActions";
import {
  type CatalogSkuPickModalKind,
} from "@/app/admin/_components/CatalogSkuPickModal";
import {
  AdminPaperRowFields,
  type SlotPaperPrint,
} from "@/app/admin/_components/AdminPaperRowFields";
import { getPdfPageCount } from "@/app/admin/_lib/pdfPageCount";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  paperPrintFromStoredFile,
  wizardRowFilesForLine,
} from "./adminOrderWizardHydrate";
import {
  wizardLineKey,
  minimalUploadReadyMugLayout,
  minimalUploadReadyNotebookLayout,
  applyMinimalLayoutJsonWhenNewUpload,
} from "./adminWizardLayoutPrepare";
import {
  convertPickedDesignerItem,
  designerCreateLine,
  designerProductForVariant,
  designerRowVariantId,
  designerUpdateLineFields,
  emptyWizardSublimationDraft,
  emptyWizardUvDraft,
  pickPrintMethodItem,
  type DesignerLineCatalogs,
} from "./designerLines";
import {
  buildStockMenuEntries,
  rowMenuState,
  stockCategoryName,
  stockMenuCategories,
  UV_DTF_STICKERS_SERVICE,
  type RowMenuState,
  type StockMenuEntry,
  type StockMethod,
} from "./stockMenu";
import { StockItemPickerModal } from "@/app/admin/_components/uv/StockItemPickerModal";
import type { ProductMenuClientService, ProductMenuCurrent, ProductMenuStockCategory } from "@/app/admin/_components/ProductTypeMenu";
import {
  adminLineProductTypes,
  adminProductMenuValue,
  isDesignerProductType,
  printMethodForDesignerProduct,
} from "@/lib/printMethods/designerProducts";
import { DesignerLineMethodHeader } from "@/app/admin/_components/printMethods/DesignerLineMethodHeader";
import {
  computeLargeFormatLinePricing,
  roundMoneyMdl,
} from "@/lib/largeFormat/largeFormatLinePricing";
import {
  hasLfLineExtras,
  lfLineExtrasInputRu,
  lfLineTotalWithExtrasMdl,
  lfWizardLineTotalBreakdownMdl,
  type LfLineExtrasInput,
} from "@/lib/largeFormat/lfLineExtras";
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
import {
  applyGroupMinimumSellTotal,
  applyLfMinimumLineSellTotalMdl,
} from "@/lib/largeFormat/lfMinimumLineSell";
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
import { DtfLineEditor } from "@/app/admin/_components/dtf/DtfLineEditor";
import { ProductTypeMenu } from "@/app/admin/_components/ProductTypeMenu";
import type { DtfCatalogJson } from "@/lib/dtf/dtfDto";
import type { DtfLineInput } from "@/lib/dtf/dtfLineInput";
import { dtfZoneFilePaperType, dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import { ArtworkSizeCheckLine } from "@/components/ArtworkSizeCheckLine";
import { readLocalFileMetaCached } from "@/lib/files/useLocalFileMeta";
import { paperPrintSizeCm, sizeFromStrings, type PrintSizeCm } from "@/lib/files/declaredPrintSize";
import {
  dtfDraftFromLineData,
  dtfDraftLayoutRuns,
  dtfDraftToInput,
  dtfDraftTotalPieces,
  emptyDtfDraft,
  newDtfLayoutKey,
  quoteDtfDraft,
  withDtfGarment,
  type DtfDraft,
  type DtfQuote,
} from "@/lib/dtf/dtfDraft";
import { isDtfErrorCode, type DtfErrorCode } from "@/lib/dtf/dtfErrors";
import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import { UvLineEditor, UvProfitPanel } from "@/app/admin/_components/uv/UvLineEditor";
import { buildUvLineData } from "@/lib/uv/buildUvLineData";
import type { UvLineData } from "@/lib/uv/types";
import type { UvCatalogJson, UvStockItemJson } from "@/lib/uv/dto";
import type { UvLineInput } from "@/lib/uv/uvLineInput";
import { uvZoneFilePaperType, uvZoneIdFromPaperType } from "@/lib/uv/uvConstants";
import {
  emptyUvStickersDraft,
  quoteUvDraft,
  uvDraftFromLineData,
  uvDraftItemSize,
  uvDraftQuantity,
  uvDraftToInput,
  withUvItem,
  type UvDraft,
  type UvQuote,
} from "@/lib/uv/uvDraft";
import { isUvErrorCode, type UvErrorCode } from "@/lib/uv/uvErrors";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import { SublimationLineEditor } from "@/app/admin/_components/sublimation/SublimationLineEditor";
import type { SublimationCatalogJson } from "@/lib/sublimation/dto";
import type { SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import { SUBLIMATION_FILE_PAPER_TYPE } from "@/lib/sublimation/sublimationConstants";
import {
  quoteSublimationDraft,
  sublimationDraftFromLineData,
  sublimationDraftQuantity,
  sublimationDraftToInput,
  withSublimationSource,
  type SublimationDraft,
  type SublimationQuote,
} from "@/lib/sublimation/sublimationDraft";
import { isSublimationErrorCode, type SublimationErrorCode } from "@/lib/sublimation/sublimationErrors";
import { parseSublimationLineData } from "@/lib/sublimation/parseSublimationLineData";
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
  refitQuantityToWholeSheets,
  snapQuantityToWholeSheets,
  type BusinessCardSides,
} from "@/lib/businessCard/businessCardConstants";
import {
  findSheetProductPreset,
  isSheetProductPresetFor,
  isSheetProductType,
  sheetFootprintFromTrim,
  sheetProductConfig,
  type SheetProductPresetId,
} from "@/lib/sheetProduct/sheetProductConfig";
import {
  computeBusinessCardSheetLayout,
  sheetsForQuantity,
  type BusinessCardSheetLayout,
} from "@/lib/businessCard/businessCardSheetLayout";
import {
  applyBusinessCardMinimumLineTotal,
  businessCardPerCardRateMdl,
  computeBusinessCardLinePricing,
  isBusinessCardPackRun,
} from "@/lib/businessCard/businessCardLinePricing";
import { SHOP_BC_PACKS } from "@/lib/storefront/businessCards";
import {
  STICKER_SHEET_DEFAULTS,
  buildStickerSheetLineData,
  computeStickerSheetLayout,
  isStickerSheetPaper,
  stickerRoundSheets,
  stickerSheetsForQuantity,
  type StickerSheetSettings,
} from "@/lib/stickerSheet/stickerSheet";
import {
  defaultStickerDraft,
  stickerCopiesStrFromLineData,
  stickerDraftFromLineData,
  stickerDraftPieces,
  stickerDraftSizeMm,
  type StickerDraft,
} from "@/lib/stickerSheet/stickerSheetDraft";
import { StickerSheetRowFields } from "@/app/admin/_components/StickerSheetRowFields";
import { LineTypeHint } from "@/app/admin/_components/LineTypeHint";
import {
  normalizeHintText,
  parseHintPrefill,
  suggestLineTypes,
  type TypeHintInput,
  type TypeHintTarget,
} from "@/lib/orderTypeHint/orderTypeHint";
import { PostcardFinishingFields, PostcardPurposeFields } from "@/app/admin/_components/PostcardRowFields";
import {
  POSTCARD_DEFAULTS,
  POSTCARD_FOLDED_PRESET_ID,
  POSTCARD_PURPOSE_DEFAULT_PRESET,
  POSTCARD_SHEET_FORMAT_SPECS,
  buildPostcardLineData,
  resolvePostcardLayout,
  type PostcardLineInfo,
  type PostcardSettings,
  type PostcardSheetFormat,
} from "@/lib/postcard/postcard";
import {
  defaultPostcardDraft,
  postcardDraftFromLineData,
  postcardPricingKey,
  type PostcardDraft,
} from "@/lib/postcard/postcardDraft";
import {
  businessCardTrimSize,
  parseBusinessCardLineData,
} from "@/lib/businessCard/parseBusinessCardLineData";
import {
  storedManualSheetLineTotalMdl,
  withoutManualSheetLinePrice,
} from "@/lib/businessCard/manualSheetLinePrice";
import {
  isManualTotalSnapshotType,
  isManualUnitPriceType,
  storedManualLineTotalMdl,
  storedManualUnitPriceMdl,
} from "@/lib/orderLines/manualLinePrice";
import {
  AdminBusinessCardRowFields,
  type BusinessCardArtworkVerdict,
} from "@/app/admin/_components/AdminBusinessCardRowFields";
import {
  checkBusinessCardArtwork,
  type BusinessCardSizeCm,
} from "@/lib/businessCard/businessCardArtworkCheck";
import {
  readBusinessCardArtworkSizeCm,
  readStoredBusinessCardArtworkSizeCm,
} from "@/app/admin/_lib/businessCardArtworkSize";
import { storedFileDownloadUrl } from "@/lib/files/storedFileDownloadUrl";
import { CABINET_FILE_META_ENDPOINT } from "@/lib/files/useFileMeta";

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

const WIZARD_PRODUCT_TYPES: readonly ProductType[] = [
  "paper_print",
  "mug",
  "notebook",
  "pen",
  "large_format_print",
  "business_card",
  "flyer",
  "postcard",
  "sticker_sheet",
  "dtf_apparel",
  "uv_print",
  "sublimation_print",
];

/**
 * Product menu of a line and of «Тип для выбранных»: pen / notebook / mug are
 * picked as items inside «UV-печать» / «Сублимация» (stage E), not as products.
 */
const ADMIN_LINE_PRODUCT_TYPES: readonly ProductType[] = adminLineProductTypes(WIZARD_PRODUCT_TYPES);

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
  /**
   * «dealer»: the dealer cabinet's copy of the wizard. No client picker, no
   * manual prices, no costs or margins; the order is sent to
   * `POST /api/cabinet/orders`, which prices every line at the dealer tier.
   */
  audience?: "staff" | "dealer";
  initialProduct: string | null;
  initialMode: string | null;
  fromInvoiceLineItemId?: string | null;
  initialClientId?: string | null;
  /** Comma-separated Design Studio ids from `?designs=` (RSC fallback). */
  initialDesigns?: string | null;
  /** When set, wizard hydrates from GET /api/admin/orders/:id and PATCHes on save. */
  editOrderId?: string | null;
  /**
   * «Повторить заказ»: prefill a NEW order from this order (same client and
   * lines). Files come from the library or storage when still there; the
   * others are flagged «файл нужно загрузить заново».
   */
  repeatOrderId?: string | null;
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
  /** New order only: artwork sent as a link (Google Drive, …) instead of a file. */
  linkUrl?: string;
  /**
   * Already stored artwork reused as is (no upload, no copy): «Из библиотеки»
   * (`library/…`) or a file of the repeated order still in storage.
   */
  reuse?: WizardReusedFile;
  /** «Повторить заказ»: the original file is gone — shown until a file is attached. */
  missingFileName?: string;
  /** «Повторить заказ»: layout photos dropped because they are gone from storage. */
  expiredPhotoCount?: number;
}

/** Text the «подсказка типа» reads for a row: the order comment and the row's file name / link. */
function typeHintInputForSlot(slot: AdminWizardSlot | undefined, notes: string): TypeHintInput {
  return {
    notes,
    fileNames: [slot?.file?.name ?? slot?.existingFile?.fileName ?? slot?.reuse?.fileName ?? null, slot?.linkUrl ?? null],
  };
}

/** Stock category the item picker opens on for a mug / notebook / pen hint. */
const TYPE_HINT_STOCK_CATEGORY: Partial<Record<TypeHintTarget, string>> = {
  mug: "mugs",
  notebook: "notebooks",
  pen: "pens",
};

/**
 * Sheet paper of the named weight («300 гр» → a 300 g paper), matte or gloss
 * when the text says which; null when none has that weight.
 */
function sheetPaperForHint(
  papers: readonly { id: string; name: string; gsm: number | null }[],
  gsm: number | undefined,
  text: string,
): string | null {
  if (gsm == null) return null;
  // Weight not recorded on every paper yet: «A4+ 300gr» says it in the name.
  const weightOf = (p: { name: string; gsm: number | null }): number | null =>
    p.gsm ?? (Number(/(?<![0-9])([1-4]\d{2})\s?(?:g|г)/i.exec(p.name)?.[1]) || null);
  const same = papers.filter((p) => weightOf(p) === gsm);
  if (same.length === 0) return null;
  const t = normalizeHintText(text);
  const gloss = /глян|gloss|luci/.test(t);
  const matte = /(?<![a-zа-я])(мат|mat|matt|mate)(?![a-zа-я])|матов/.test(t);
  const pick =
    (gloss && same.find((p) => /gloss|глян|luci/i.test(p.name))) ||
    (matte && same.find((p) => /mat/i.test(p.name))) ||
    same[0]!;
  return pick.id;
}

/** Sheet imposition and DTF film nesting read the artwork, so a link will not do. */
function linkNotAllowedFor(productType: ProductType): boolean {
  return isSheetProductType(productType) || productType === "dtf_apparel";
}

function slotHasArtwork(s: AdminWizardSlot): boolean {
  return Boolean(s.file || s.existingFile || s.linkUrl || s.reuse);
}

/** Name shown for a row's artwork, or null when it has none. */
function slotArtworkName(s: AdminWizardSlot): string | null {
  return s.file?.name ?? s.existingFile?.fileName ?? s.reuse?.fileName ?? s.linkUrl ?? null;
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
  /**
   * Banner finishing / roll-up set of a loaded line (storefront orders): not
   * edited here, kept by the server on save; counted in the line price.
   */
  lfExtras?: LfLineExtrasInput | null;
  /** Business cards / flyers: sheet paper the run is imposed on. */
  bcSheetPaperId: string | null;
  bcSides: BusinessCardSides;
  /** Finished size standard, or `"custom"` for the free-form pair below. */
  bcPresetId: SheetProductPresetId;
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
  /** «Повторить заказ»: reverse artwork reused from storage / the library (no upload). */
  bcBackReuse?: WizardReusedFile | null;
  /**
   * Edit mode: the run and price the line was stored with. While the row's
   * paper, run, sides, tier and size still match, the row shows (and the
   * server keeps) this sold price instead of re-pricing at today's rate.
   */
  bcStored?: BcStoredPricing | null;
  /** Sticker sheets: shape, size, cut, format, run mode (null until the row becomes stickers). */
  sticker?: StickerDraft | null;
  /** Postcards: purpose, sheet, whole sheets, finishing (null until the row becomes postcards). */
  postcard?: PostcardDraft | null;
  /** DTF on apparel: garment, sizes and print zones (null until the row becomes DTF). */
  dtf: DtfDraft | null;
  /** UV print: stock or client item, quantity and print zones (null until the row becomes UV). */
  uv: UvDraft | null;
  /** Sublimation: stock blank and quantity (null until the row becomes sublimation). */
  sublimation: SublimationDraft | null;
  /** Design Studio source, when the row was prefilled from a saved design. */
  designId: string | null;
  /** «Набор»: the set this row belongs to (`lib/giftSet/giftSetWizard.ts`); null / absent = not in a set. */
  giftSet?: GiftSetRowAssign | null;
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

interface BcStoredPricing {
  productType: ProductType;
  sheetPaperId: string | null;
  quantity: number;
  sides: BusinessCardSides;
  customerType: LargeFormatCustomerType;
  trimWidthCm: number;
  trimHeightCm: number;
  totalSellPriceMdl: number;
  pricePerSheetMdl: number;
  pricePerCardMdl: number | null;
  /** Sticker sheets: shape / cut / format the price was sold with. */
  sticker?: { shape: string; cut: boolean; format: string } | null;
  /** Postcards: what drove the sold price (`postcardPricingKey`). */
  postcardKey?: string | null;
}

/** Large-format print size of a new row (cm) until the user or the file sets it. */
const EMPTY_ASSIGN_LF_WIDTH = "100";
const EMPTY_ASSIGN_LF_HEIGHT = "100";

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
    lfPrintWidthCmStr: EMPTY_ASSIGN_LF_WIDTH,
    lfPrintHeightCmStr: EMPTY_ASSIGN_LF_HEIGHT,
    lfCustomerType: lfDefaultCustomerType,
    lfSizePresetId: null,
    bcSheetPaperId: bcDefaultSheetPaperId,
    bcSides: "one",
    bcPresetId: BUSINESS_CARD_DEFAULT_PRESET_ID,
    bcTrimWidthStr: "",
    bcTrimHeightStr: "",
    bcBackFile: null,
    bcBackExistingFile: null,
    dtf: null,
    uv: null,
    sublimation: null,
    designId: null,
  };
}

/** Local price of a DTF row (null when the row is not DTF). */
function dtfSlotQuote(a: SlotAssign, catalog: DtfCatalogJson): DtfQuote | null {
  if (a.productType !== "dtf_apparel" || !a.dtf) return null;
  return quoteDtfDraft(a.dtf, a.lfCustomerType, catalog);
}

/** Ensures a DTF row has an editor draft and its copies mirror the total pieces. */
function withDtfDraft(a: SlotAssign, catalog: DtfCatalogJson): SlotAssign {
  if (a.productType !== "dtf_apparel") return a;
  const dtf: DtfDraft = a.dtf ?? emptyDtfDraft(catalog);
  const pieces: number = dtfDraftTotalPieces(dtf);
  const copiesStr: string = String(Math.max(1, pieces));
  return dtf === a.dtf && copiesStr === a.copiesStr ? a : { ...a, dtf, copiesStr };
}

/**
 * Settings of «Наклейки на листе» for the wizard's local pricing, set from the
 * bootstrap on render (static for the page; the server prices with the same).
 */
let wizardStickerSettings: StickerSheetSettings = STICKER_SHEET_DEFAULTS;
/** «Открытки и карточки» settings, set from the bootstrap like the sticker ones. */
let wizardPostcardSettings: PostcardSettings = POSTCARD_DEFAULTS;

/** Postcard rows get a draft; a row leaving postcards drops it. */
function withPostcardDraft(a: SlotAssign): SlotAssign {
  if (a.productType === "postcard") return a.postcard ? a : { ...a, postcard: defaultPostcardDraft() };
  return a.postcard == null ? a : { ...a, postcard: null };
}

/** The `postcard` block of an order line. */
function postcardLineInput(d: PostcardDraft): NonNullable<AdminOrderLineInput["postcard"]> {
  return {
    purpose: d.purpose,
    format: d.format,
    wholeSheet: d.wholeSheet,
    lamination: d.lamination,
    creaseLines: d.creaseLines,
    roundedCorners: d.roundedCorners,
    figuredCut: d.figuredCut,
  };
}

/**
 * Sticker rows get a draft and the sticker paper; a row leaving stickers drops
 * the draft and goes back off the sticker paper.
 */
function withStickerDraft(
  a: SlotAssign,
  stickerPaperId: string | null,
  bcDefaultPaperId: string | null,
): SlotAssign {
  if (a.productType === "sticker_sheet") {
    const sticker = a.sticker ?? defaultStickerDraft();
    const paperOk = a.bcSheetPaperId != null && a.bcSheetPaperId === stickerPaperId;
    if (sticker === a.sticker && paperOk && a.bcSides === "one") return a;
    return { ...a, sticker, bcSheetPaperId: paperOk ? a.bcSheetPaperId : stickerPaperId, bcSides: "one", bcPresetId: "custom" };
  }
  if (a.sticker == null && !(isSheetProductType(a.productType) && a.bcSheetPaperId === stickerPaperId && stickerPaperId)) return a;
  return {
    ...a,
    sticker: null,
    ...(isSheetProductType(a.productType) && a.bcSheetPaperId === stickerPaperId ? { bcSheetPaperId: bcDefaultPaperId } : {}),
  };
}

/** The `sticker` block of an order line from the row draft and its resolved size. */
function stickerLineInput(
  d: StickerDraft,
  trim: { trimWidthCm: number; trimHeightCm: number },
): NonNullable<AdminOrderLineInput["sticker"]> {
  return {
    shape: d.shape,
    widthMm: Math.round(trim.trimWidthCm * 100) / 10,
    heightMm: Math.round(trim.trimHeightCm * 100) / 10,
    cut: d.cut,
    format: d.format,
    quantityMode: d.quantityMode,
  };
}

function requireDtfInput(a: SlotAssign): DtfLineInput {
  const input: DtfLineInput | null = a.dtf ? dtfDraftToInput(a.dtf) : null;
  if (!input) throw new Error("dtf_details_required");
  return input;
}

/** Artwork tag for a DTF file: kept when it already names a zone, else the first zone. */
function dtfFilePaperType(a: SlotAssign, existingPaperType: string | null): string {
  const taggedZoneId: string | null = dtfZoneIdFromPaperType(existingPaperType);
  if (taggedZoneId && a.dtf?.zones.some((z) => z.id === taggedZoneId)) {
    return dtfZoneFilePaperType(taggedZoneId);
  }
  const firstZoneId: string | undefined = a.dtf?.zones[0]?.id;
  if (!firstZoneId) throw new Error("dtf_details_required");
  return dtfZoneFilePaperType(firstZoneId);
}

/**
 * Print size the row declares for its main file (cm), for the artwork check.
 * DTF / UV: the zone the file is tagged to (else the first zone).
 */
function slotDeclaredSize(
  a: SlotAssign,
  filePaperType: string | null,
  dtfCatalog: DtfCatalogJson,
): PrintSizeCm | null {
  switch (a.productType) {
    case "dtf_apparel": {
      const zones = a.dtf?.zones ?? [];
      const tagged = dtfZoneIdFromPaperType(filePaperType);
      const zone = zones.find((z) => z.id === tagged) ?? zones[0];
      if (!zone) return null;
      if (zone.presetId) {
        const preset = dtfCatalog.presets.find((p) => p.id === zone.presetId);
        return preset ? { widthCm: preset.widthCm, heightCm: preset.heightCm } : null;
      }
      return sizeFromStrings(zone.widthStr, zone.heightStr);
    }
    case "uv_print": {
      const zones = a.uv?.zones ?? [];
      const tagged = uvZoneIdFromPaperType(filePaperType);
      const zone = zones.find((z) => z.id === tagged) ?? zones[0];
      return zone ? sizeFromStrings(zone.widthStr, zone.heightStr) : null;
    }
    case "sublimation_print":
      return a.sublimation ? sizeFromStrings(a.sublimation.widthStr, a.sublimation.heightStr) : null;
    case "large_format_print":
      return sizeFromStrings(a.lfPrintWidthCmStr, a.lfPrintHeightCmStr);
    case "paper_print":
      return a.paperPrint
        ? paperPrintSizeCm(a.paperPrint.paperType, a.paperPrint.customWidth, a.paperPrint.customHeight)
        : null;
    default:
      // Business cards / flyers have their own bleed check; mugs, notebooks, pens take the SKU size.
      return null;
  }
}

/** Local price of a UV row (null when the row is not UV). */
function uvSlotQuote(a: SlotAssign, catalog: UvCatalogJson): UvQuote | null {
  if (a.productType !== "uv_print" || !a.uv) return null;
  return quoteUvDraft(a.uv, a.lfCustomerType, catalog);
}

/** Ensures a UV row has an editor draft and its copies mirror the quantity. */
function withUvDraft(a: SlotAssign, catalog: UvCatalogJson): SlotAssign {
  if (a.productType !== "uv_print") return a;
  const uv: UvDraft = a.uv ?? emptyWizardUvDraft(catalog);
  const copiesStr: string = String(Math.max(1, uvDraftQuantity(uv)));
  return uv === a.uv && copiesStr === a.copiesStr ? a : { ...a, uv, copiesStr };
}

function requireUvInput(a: SlotAssign): UvLineInput {
  const input: UvLineInput | null = a.uv ? uvDraftToInput(a.uv) : null;
  if (!input) throw new Error("uv_details_required");
  return input;
}

/** Artwork tag for a UV file: kept when it already names a zone, else the first zone. */
function uvFilePaperType(a: SlotAssign, existingPaperType: string | null): string {
  const taggedZoneId: string | null = uvZoneIdFromPaperType(existingPaperType);
  if (taggedZoneId && a.uv?.zones.some((z) => z.id === taggedZoneId)) {
    return uvZoneFilePaperType(taggedZoneId);
  }
  const firstZoneId: string | undefined = a.uv?.zones[0]?.id;
  if (!firstZoneId) throw new Error("uv_details_required");
  return uvZoneFilePaperType(firstZoneId);
}

/** Local price of a sublimation row (null when the row is not sublimation). */
function sublimationSlotQuote(a: SlotAssign, catalog: SublimationCatalogJson): SublimationQuote | null {
  if (a.productType !== "sublimation_print" || !a.sublimation) return null;
  return quoteSublimationDraft(a.sublimation, a.lfCustomerType, catalog);
}

/** Ensures a sublimation row has an editor draft and its copies mirror the quantity. */
function withSublimationDraft(a: SlotAssign, catalog: SublimationCatalogJson): SlotAssign {
  if (a.productType !== "sublimation_print") return a;
  const sublimation: SublimationDraft = a.sublimation ?? emptyWizardSublimationDraft(catalog);
  const copiesStr: string = String(Math.max(1, sublimationDraftQuantity(sublimation)));
  return sublimation === a.sublimation && copiesStr === a.copiesStr ? a : { ...a, sublimation, copiesStr };
}

function requireSublimationInput(a: SlotAssign): SublimationLineInput {
  const input: SublimationLineInput | null = a.sublimation ? sublimationDraftToInput(a.sublimation) : null;
  if (!input) throw new Error("subl_details_required");
  return input;
}

function newSlotId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Notebook / pen row as a UV stock line: the item price for the row quantity
 * (run-size tier, or the dealer price for dealers) with its main print included,
 * plus purchase and ink costs from the item's print parameters. Null when the
 * row has no catalog item or the item is not in the UV catalog.
 */
function designerUvLine(a: SlotAssign, uvCatalog: UvCatalogJson): UvLineData | null {
  if (a.productType !== "notebook" && a.productType !== "pen") return null;
  const pick = a.productType === "notebook" ? a.nbPick : a.penPick;
  if (pick?.type !== "catalog") return null;
  const item = uvCatalog.items.find((i) => i.id === pick.productId);
  if (!item) return null;
  const quantity: number = Math.max(1, parseAdminCopiesInput(a.copiesStr) ?? 1);
  try {
    return buildUvLineData(
      {
        source: "stock",
        variantId: item.id,
        quantity,
        zones: [
          {
            id: "main",
            placement: "front",
            whiteLayers: item.printNorms.whiteLayers,
            varnish: item.printNorms.varnish,
            primer: item.printNorms.primer,
          },
        ],
      },
      a.lfCustomerType,
      { item, settings: uvCatalog.settings, inkCosts: uvCatalog.inkCosts },
    );
  } catch {
    return null;
  }
}

/** Catalog price per piece: notebooks / pens by run size and customer type (UV catalog), else the dealer price for dealers or the retail sell price. */
function catalogUnitMdl(
  a: SlotAssign,
  mugById: Map<string, MugProductOption>,
  nbById: Map<string, NotebookProductOption>,
  penById: Map<string, PenProductOption>,
  uvCatalog: UvCatalogJson,
): number | null {
  const uvLine: UvLineData | null = designerUvLine(a, uvCatalog);
  if (uvLine) return round2(uvLine.pricing.unitItemPriceMdl);
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
  const product = catalog.get(pick.productId) as
    | { sellPrice?: number | null; dealerPrice?: number | null }
    | undefined;
  // Dealers pay the dealer price when the item has one (bootstrap rows carry it).
  const dealer = product?.dealerPrice;
  const price =
    a.lfCustomerType === "dealer" && dealer != null && Number.isFinite(Number(dealer))
      ? dealer
      : product?.sellPrice;
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

/**
 * Staff «ручная цена» of a row as request fields (null clears it): the line
 * total for sheet / large-format / DTF / UV / sublimation lines, the price per
 * piece for paper / mug / notebook / pen lines. Stripped for dealers.
 */
function manualPriceLineFields(
  productType: string,
  linePriceStr: string,
): { manualLineTotalMdl?: number | null; manualUnitPriceMdl?: number | null } {
  const v = parsedLinePriceMdl(linePriceStr);
  if (isManualUnitPriceType(productType)) return { manualUnitPriceMdl: v };
  if (isSheetProductType(productType) || isManualTotalSnapshotType(productType)) return { manualLineTotalMdl: v };
  return {};
}

/** Dealer cabinet line: the server sets the tier; Design Studio links stay staff-only. */
function toDealerLine(line: AdminOrderLineInput): Omit<AdminOrderLineInput, "customerType" | "designId"> {
  const out: AdminOrderLineInput = { ...line };
  delete out.customerType;
  delete out.designId;
  delete out.manualLineTotalMdl;
  delete out.manualUnitPriceMdl;
  if (out.set) out.set = { ...out.set, manualUnitPriceMdl: undefined };
  return out;
}

/**
 * Send the dealer wizard's lines to `POST /api/cabinet/orders`. With `dryRun`
 * the server only prices them. Throws an Error whose message is the server's
 * error code (mapped to a localized text by the wizard).
 */
/** Server code of a dealer edit refused because the order can no longer be changed. */
const DEALER_ORDER_LOCKED_CODE = "order_locked";

/** «Срочно» as the server quotes it: the offer (fee from the dealer's card) and the order's state. */
interface DealerUrgencyQuote {
  available: boolean;
  feeMdl?: number;
  state: "off" | "dealer" | "staff";
  /** Fee already frozen on the order (edit, dealer urgency on). */
  orderFeeMdl?: number | null;
}

interface DealerQuoteResponse {
  id?: string;
  totalMdl?: number | null;
  goodsTotalMdl?: number | null;
  lineTotalsMdl?: (number | null)[];
  urgency?: DealerUrgencyQuote;
  error?: string;
  code?: string;
}

async function postDealerOrder(
  lines: AdminOrderLineInput[],
  notes: string,
  dryRun: boolean,
  urgent?: boolean,
): Promise<DealerQuoteResponse> {
  const res = await fetch("/api/cabinet/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      notes: notes.trim() || undefined,
      dryRun: dryRun || undefined,
      urgent: urgent || undefined,
      lines: lines.map(toDealerLine),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as DealerQuoteResponse;
  if (!res.ok) {
    throw new Error(body.code ?? body.error ?? "Failed to create order");
  }
  return body;
}

/**
 * Dealer edit of an own order: `PUT /api/cabinet/orders/:id` with the
 * wizard's update lines (existing files by id, new ones uploaded). With
 * `dryRun` the server only prices them. Throws an Error whose message is the
 * server's error code (`order_locked`, …).
 */
async function putDealerOrderEdit(
  orderId: string,
  lines: AdminOrderUpdateLineInput[],
  notes: string,
  dryRun: boolean,
  urgent?: boolean,
): Promise<DealerQuoteResponse> {
  const res = await fetch(`/api/cabinet/orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      notes: notes.trim() || null,
      dryRun: dryRun || undefined,
      urgent,
      lines: lines.map((line) => {
        const out: AdminOrderUpdateLineInput = { ...line };
        delete out.customerType;
        delete out.designId;
        delete out.manualLineTotalMdl;
        delete out.manualUnitPriceMdl;
        return out;
      }),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as DealerQuoteResponse;
  if (!res.ok) {
    throw new Error(body.code ?? body.error ?? "Failed to update order");
  }
  return body;
}

type LfWizardErrCopy = {
  lfPackDoesNotFit: string;
  lfPackQuantityTooLarge: (max: number) => string;
};

function formatLfAdminOrderSaveError(
  err: unknown,
  copy: LfWizardErrCopy,
  dtfErrors: Record<DtfErrorCode, string>,
  uvErrors: Record<UvErrorCode, string>,
  sublimationErrors: Record<SublimationErrorCode, string>,
): string {
  const msg = err instanceof Error ? err.message : "";
  if (isDtfErrorCode(msg)) return dtfErrors[msg];
  if (isUvErrorCode(msg)) return uvErrors[msg];
  if (isSublimationErrorCode(msg)) return sublimationErrors[msg];
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
    catalogCostPerLm: opts.mat.costPerLinearMeter,
    avgCostPerLm: opts.mat.avgPurchaseCostPerLinearMeter,
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
  return lfLineTotalWithExtrasMdl(lf.pricing.totalSellPrice, { widthCm: w, heightCm: h, quantity: q }, a.lfExtras);
}

/**
 * Keeps the size preset valid for the row's sheet product: switching between
 * business cards and flyers falls back to the new product's default size.
 */
function withSheetProductPreset(a: SlotAssign): SlotAssign {
  if (!isSheetProductType(a.productType)) return a;
  if (isSheetProductPresetFor(a.productType, a.bcPresetId)) return a;
  return { ...a, bcPresetId: sheetProductConfig(a.productType).defaultPresetId };
}

/** Finished card size the row describes, or null while the custom pair is blank. */
function bcAssignTrimSize(
  a: SlotAssign,
): { trimWidthCm: number; trimHeightCm: number } | null {
  if (!isSheetProductType(a.productType)) return null;
  if (a.productType === "sticker_sheet") {
    const mm = a.sticker ? stickerDraftSizeMm(a.sticker) : null;
    return mm ? { trimWidthCm: mm.widthMm / 10, trimHeightCm: mm.heightMm / 10 } : null;
  }
  if (a.productType === "postcard" && a.postcard?.wholeSheet) {
    const spec = POSTCARD_SHEET_FORMAT_SPECS[a.postcard.format];
    return { trimWidthCm: spec.widthCm, trimHeightCm: spec.heightCm };
  }
  const config = sheetProductConfig(a.productType);
  const preset = findSheetProductPreset(a.productType, a.bcPresetId);
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
    cm >= config.minSideCm &&
    cm <= config.maxSideCm;
  if (!inRange(trimWidthCm) || !inRange(trimHeightCm)) return null;
  return { trimWidthCm, trimHeightCm };
}

/**
 * How the row's card sits on its paper, independent of the run size. `null`
 * until paper and size are both set, or when the card does not fit the sheet.
 */
function bcSlotLayout(
  a: SlotAssign,
  paperById: Map<string, AdminSheetPaperJson>,
): {
  paper: AdminSheetPaperJson;
  trim: { trimWidthCm: number; trimHeightCm: number };
  layout: BusinessCardSheetLayout;
} | null {
  if (!isSheetProductType(a.productType)) return null;
  const paper = a.bcSheetPaperId ? paperById.get(a.bcSheetPaperId) : undefined;
  if (!paper) return null;
  const trim = bcAssignTrimSize(a);
  if (!trim) return null;
  if (a.productType === "sticker_sheet") {
    const layout = computeStickerSheetLayout({
      format: a.sticker?.format ?? "A3+",
      widthMm: trim.trimWidthCm * 10,
      heightMm: trim.trimHeightCm * 10,
      marginMm: wizardStickerSettings.marginMm,
      gapMm: wizardStickerSettings.gapMm,
    });
    return layout.cardsPerSheet > 0 ? { paper, trim, layout } : null;
  }
  if (a.productType === "postcard") {
    const { layout } = postcardSlotLayout(a, trim);
    return layout.cardsPerSheet > 0 ? { paper, trim, layout } : null;
  }
  const layout = computeBusinessCardSheetLayout({
    sheetWidthCm: paper.sheetWidthCm,
    sheetHeightCm: paper.sheetHeightCm,
    ...sheetFootprintFromTrim(
      trim.trimWidthCm,
      trim.trimHeightCm,
      sheetProductConfig(a.productType).bleedCm,
    ),
  });
  return layout.cardsPerSheet > 0 ? { paper, trim, layout } : null;
}

/** Postcard grid on its sheet: the requested format, or A3+ when the item does not fit A4+. */
function postcardSlotLayout(
  a: SlotAssign,
  trim: { trimWidthCm: number; trimHeightCm: number },
): { format: PostcardSheetFormat; layout: BusinessCardSheetLayout } {
  const d = a.postcard ?? defaultPostcardDraft();
  return resolvePostcardLayout({
    format: d.format,
    trimWidthCm: trim.trimWidthCm,
    trimHeightCm: trim.trimHeightCm,
    wholeSheet: d.wholeSheet,
    figuredCut: d.figuredCut && !d.wholeSheet,
    settings: wizardPostcardSettings,
  });
}

/** Sheet a postcard row prints on (for the format toggle); the requested one until the size is known. */
function postcardEffectiveFormat(a: SlotAssign): PostcardSheetFormat {
  const d = a.postcard ?? defaultPostcardDraft();
  const trim = bcAssignTrimSize(a);
  return trim ? postcardSlotLayout(a, trim).format : d.format;
}

/**
 * Rewrites the row's run so the field itself shows whole sheets. `refit` is for
 * a new sheet capacity (nearest sheet); otherwise the typed run is rounded up.
 * Leaves the row alone while the size is incomplete or the input is not a number.
 */
function bcWithWholeSheetQuantity(
  a: SlotAssign,
  paperById: Map<string, AdminSheetPaperJson>,
  mode: "round_up" | "refit",
): SlotAssign {
  const imposed = bcSlotLayout(a, paperById);
  const typed = parseAdminCopiesInput(a.copiesStr);
  if (!imposed || typed === null || !isSheetProductType(a.productType)) return a;
  // Stickers: any run in pieces (or whole sheets typed in «листов»). Postcards: exact pieces.
  if (a.productType === "sticker_sheet" || a.productType === "postcard") return a;
  // A shop pack (100, 200…) of retail cards stays as typed: billed per card.
  if (isBusinessCardPackRun(a.productType, a.lfCustomerType, typed)) return a;
  const { cardsPerSheet } = imposed.layout;
  const quantity =
    mode === "refit"
      ? refitQuantityToWholeSheets(typed, cardsPerSheet)
      : snapQuantityToWholeSheets(typed, cardsPerSheet);
  const copiesStr = String(
    Math.min(quantity, sheetProductConfig(a.productType).maxQuantity),
  );
  return copiesStr === a.copiesStr ? a : { ...a, copiesStr };
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
  const imposed = bcSlotLayout(a, paperById);
  if (!imposed) return null;
  const { paper, trim, layout } = imposed;

  const typedQuantity = parseAdminCopiesInput(a.copiesStr);
  if (typedQuantity === null || typedQuantity < 1) return null;
  if (a.productType === "sticker_sheet") {
    const pieces = a.sticker ? stickerDraftPieces(a.sticker, typedQuantity, layout.cardsPerSheet) : null;
    if (pieces === null) return null;
    // A4+ goes in pairs (sheets rounded up to even).
    const sheetsUsed = stickerSheetsForQuantity(pieces, layout.cardsPerSheet, a.sticker!.format);
    return { paper, trim, layout, quantity: pieces, sheetsUsed };
  }
  // Postcards: the run exactly as typed (pieces, or sheets for a whole sheet).
  if (a.productType === "postcard") {
    return { paper, trim, layout, quantity: typedQuantity, sheetsUsed: sheetsForQuantity(typedQuantity, layout.cardsPerSheet) };
  }

  const quantity = isSheetProductType(a.productType) && isBusinessCardPackRun(a.productType, a.lfCustomerType, typedQuantity)
    ? typedQuantity
    : snapQuantityToWholeSheets(typedQuantity, layout.cardsPerSheet);
  return {
    paper,
    trim,
    layout,
    quantity,
    sheetsUsed: sheetsForQuantity(quantity, layout.cardsPerSheet),
  };
}

/** A business-card artwork face: a fresh upload, or the id of a stored file. */
type BcArtworkKey = File | string;

/** Artwork faces a business-card row currently holds; the reverse only when double-sided. */
function bcArtworkKeys(
  slot: AdminWizardSlot,
  a: SlotAssign,
): { front: BcArtworkKey | null; back: BcArtworkKey | null } {
  return {
    front: slot.file ?? slot.existingFile?.id ?? (slot.reuse ? resolveR2Key(slot.reuse.fileUrl) : null),
    back:
      a.bcSides === "two"
        ? (a.bcBackFile ?? a.bcBackExistingFile?.id ?? (a.bcBackReuse ? resolveR2Key(a.bcBackReuse.fileUrl) : null))
        : null,
  };
}

/**
 * Bleed verdict for one face against the row's chosen size. `null` when there
 * is nothing to judge yet: no file for that face, or no valid card size.
 */
function bcArtworkVerdict(
  key: BcArtworkKey | null,
  a: SlotAssign,
  sizes: ReadonlyMap<BcArtworkKey, BusinessCardSizeCm | null>,
): BusinessCardArtworkVerdict | null {
  if (key === null || !isSheetProductType(a.productType)) return null;
  // Stickers: no bleed rule, the operator lays them out in Camera Cut.
  if (a.productType === "sticker_sheet") return null;
  // A whole sheet is printed as drawn.
  if (a.productType === "postcard" && a.postcard?.wholeSheet) return null;
  const trim = bcAssignTrimSize(a);
  if (!trim) return null;
  if (!sizes.has(key)) return { kind: "checking" };
  const size = sizes.get(key) ?? null;
  if (size === null) return { kind: "unreadable" };
  return {
    kind: "checked",
    check: checkBusinessCardArtwork(
      size,
      { widthCm: trim.trimWidthCm, heightCm: trim.trimHeightCm },
      sheetProductConfig(a.productType).bleedCm,
    ),
  };
}

/**
 * A face holds the row back while it is still being measured or is proven to
 * miss the bleed. An undecodable file only warns: blocking on a guess would
 * stop formats the workshop can still print. Flyers drawn at the finished
 * size pass: their bleed is generated when the layout is built.
 */
function bcArtworkBlocks(
  verdict: BusinessCardArtworkVerdict | null,
  generatesMissingBleed: boolean,
): boolean {
  if (verdict?.kind === "checking") return true;
  if (verdict?.kind !== "checked" || verdict.check.ok) return false;
  return !(generatesMissingBleed && verdict.check.issue === "no_bleed");
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
  /** Retail business cards: the shop's per-card rate; null = billed per sheet side. */
  pricePerCardMdl: number | null;
  totalSellPriceMdl: number;
  /** Run after rounding up to fill whole sheets. */
  quantity: number;
  /** Postcards: the calculated breakdown (absent while the stored sold price is shown). */
  postcard?: PostcardLineInfo | null;
} | null {
  const geo = bcSlotGeometry(a, paperById);
  if (!geo || !isSheetProductType(a.productType)) return null;
  const { paper, layout, quantity, sheetsUsed } = geo;
  const perCardRateMdl = businessCardPerCardRateMdl(a.productType, a.bcSides, a.lfCustomerType);

  // Edit mode, run unchanged: the price the line was sold at (the server keeps it too).
  const st = a.bcStored;
  if (
    st &&
    st.productType === a.productType &&
    st.sheetPaperId === a.bcSheetPaperId &&
    st.quantity === quantity &&
    st.sides === a.bcSides &&
    st.customerType === a.lfCustomerType &&
    Math.abs(st.trimWidthCm - geo.trim.trimWidthCm) < 0.001 &&
    Math.abs(st.trimHeightCm - geo.trim.trimHeightCm) < 0.001 &&
    (a.productType !== "sticker_sheet" ||
      (st.sticker != null &&
        a.sticker != null &&
        st.sticker.shape === a.sticker.shape &&
        st.sticker.cut === a.sticker.cut &&
        st.sticker.format === a.sticker.format)) &&
    (a.productType !== "postcard" ||
      (st.postcardKey != null &&
        a.postcard != null &&
        st.postcardKey === postcardPricingKey({ ...a.postcard, format: postcardSlotLayout(a, geo.trim).format })))
  ) {
    return {
      layout,
      sheetsUsed,
      cardsPerSheet: layout.cardsPerSheet,
      quantity,
      pricePerSheetMdl: st.pricePerSheetMdl,
      pricePerCardMdl: st.pricePerCardMdl,
      totalSellPriceMdl: st.totalSellPriceMdl,
    };
  }

  if (a.productType === "sticker_sheet" && a.sticker) {
    const built = buildStickerSheetLineData({
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
      shape: a.sticker.shape,
      widthMm: geo.trim.trimWidthCm * 10,
      heightMm: geo.trim.trimHeightCm * 10,
      cut: a.sticker.cut,
      format: a.sticker.format,
      quantityMode: a.sticker.quantityMode,
      quantity,
      customerType: a.lfCustomerType,
      settings: wizardStickerSettings,
    });
    if (!built.ok) return null;
    return {
      layout,
      sheetsUsed,
      cardsPerSheet: layout.cardsPerSheet,
      quantity,
      pricePerSheetMdl: built.data.pricePerSheetMdl,
      pricePerCardMdl: null,
      totalSellPriceMdl: built.data.totalSellPriceMdl,
    };
  }

  if (a.productType === "postcard" && a.postcard) {
    const built = buildPostcardLineData({
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
      presetId: a.bcPresetId as Parameters<typeof buildPostcardLineData>[0]["presetId"],
      trimWidthCm: geo.trim.trimWidthCm,
      trimHeightCm: geo.trim.trimHeightCm,
      sides: a.bcSides,
      quantity,
      options: a.postcard,
      customerType: a.lfCustomerType,
      settings: wizardPostcardSettings,
    });
    if (!built.ok) return null;
    return {
      layout,
      sheetsUsed,
      cardsPerSheet: layout.cardsPerSheet,
      quantity,
      // Unpriced paper → 0, so the row reads «no price» like flyers.
      pricePerSheetMdl: built.data.postcard!.printRatePerPassMdl > 0 ? built.data.pricePerSheetMdl : 0,
      pricePerCardMdl: null,
      totalSellPriceMdl: built.data.totalSellPriceMdl,
      postcard: built.data.postcard ?? null,
    };
  }

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
    perCard: perCardRateMdl != null ? { quantity, rateMdl: perCardRateMdl } : null,
  });
  // Per-card (shop-priced) lines carry no minimum, as on the storefront.
  const { pricing } = sheetProductConfig(a.productType).appliesMinimumLineTotal && perCardRateMdl == null
    ? applyBusinessCardMinimumLineTotal(base, bcMinimumLineTotalMdl)
    : { pricing: base };

  return {
    layout,
    sheetsUsed,
    cardsPerSheet: layout.cardsPerSheet,
    quantity,
    pricePerSheetMdl: pricing.pricePerSheetMdl,
    pricePerCardMdl: perCardRateMdl,
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
  dtfCatalog: DtfCatalogJson,
  uvCatalog: UvCatalogJson,
  sublimationCatalog: SublimationCatalogJson,
): number {
  if (a.productType === "dtf_apparel") {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    const quote = dtfSlotQuote(a, dtfCatalog);
    return quote?.ok ? quote.data.pricing.totalSellPriceMdl : 0;
  }
  if (a.productType === "uv_print") {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    const quote = uvSlotQuote(a, uvCatalog);
    return quote?.ok ? quote.data.pricing.totalSellPriceMdl : 0;
  }
  if (a.productType === "sublimation_print") {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    const quote = sublimationSlotQuote(a, sublimationCatalog);
    return quote?.ok ? quote.data.pricing.totalSellPriceMdl : 0;
  }
  if (a.productType === "large_format_print") {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    return lfComputedLineTotalMdl(a, lfById, lfItems, lfPrintEconomics, lfMinimumLineTotalMdl);
  }
  if (isSheetProductType(a.productType)) {
    const manualLine = parsedLinePriceMdl(a.linePriceStr);
    if (manualLine !== null) return manualLine;
    const pricing = bcSlotPricing(a, bcPaperById, bcMinimumLineTotalMdl);
    // Paper without a price per sheet: not priced (a line minimum alone is no price).
    return pricing && pricing.pricePerSheetMdl > 0 ? pricing.totalSellPriceMdl : 0;
  }
  const cop = parseAdminCopiesInput(a.copiesStr);
  const copN = cop === null ? 0 : cop;
  const parsedUnit = parsedLinePriceMdl(a.linePriceStr);
  const catalogUnit = catalogUnitMdl(a, mugById, nbById, penById, uvCatalog);
  const unit = parsedUnit ?? catalogUnit;
  if (unit === null) return 0;
  // Pens: whole lei (24 × 36.46 = 875, not 875.04).
  if (a.productType === "pen") return penLineTotalMdl(Number(unit), copN);
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
  /** A stored file id, or a same-origin URL (`/api/admin/file-by-key?key=…` for reused keys). */
  fileId: string,
  expected: { width: number; height: number },
  /** Dealer edit: files on the dealer's own order come from the cabinet endpoint. */
  dealerMode = false,
): Promise<SizeValidationResult> {
  // Could not download / decode the stored file: nothing was measured, so it
  // must not turn into a fake «expected W×H, got 0×0» that blocks the order.
  const fallback: SizeValidationResult = {
    ok: true,
    unreadable: true,
    expected,
    actual: { width: 0, height: 0 },
    tolerance: 0.02,
  };
  try {
    const res = await fetch(fileId.startsWith("/") ? fileId : storedFileDownloadUrl(fileId, dealerMode), {
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
  dealerMode = false,
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
    return validateLayoutFromExistingServerFile(slot.existingFile.id, expected, dealerMode);
  }
  if (slot.reuse) {
    return validateLayoutFromExistingServerFile(resolveR2Key(slot.reuse.fileUrl), expected, dealerMode);
  }
  return null;
}

async function buildAdminOrderUpdateLines(
  slots: AdminWizardSlot[],
  assignBySlot: Record<string, SlotAssign>,
  bcPaperById: Map<string, AdminSheetPaperJson>,
  onFileStatus?: (slotId: string, status: "uploading" | "done") => void,
  /** Uploads a new local file (dealer dry run: a placeholder, nothing is uploaded). */
  uploadArtwork: (file: File) => Promise<UploadResult> = uploadFile,
  /** «Набор» templates (each ready-set row becomes its own line built from its template zone). */
  giftSetTemplates: readonly GiftSetTemplate[] = [],
  /** Product type of each stored line (a ready-set row keeps its line id only when the type matches). */
  readySetStoredType: ReadonlyMap<string, string> = new Map(),
  /** «Набор»: stored box line id by set group (the box line keeps its id). */
  setBoxLineIds: ReadonlyMap<string, string> = new Map(),
): Promise<AdminOrderUpdateLineInput[]> {
  const out: AdminOrderUpdateLineInput[] = [];
  let i = 0;
  while (i < slots.length) {
    const s0 = slots[i]!;
    const group: AdminWizardSlot[] = [s0];
    const lid = s0.sourceOrderLineId;
    const readySet: GiftSetRowAssign | null =
      assignBySlot[s0.id]?.giftSet?.role === "ready" ? assignBySlot[s0.id]!.giftSet! : null;
    i++;
    if (readySet == null && lid != null) {
      while (
        i < slots.length &&
        slots[i]!.sourceOrderLineId === lid &&
        assignBySlot[slots[i]!.id]?.giftSet?.role !== "ready"
      ) {
        group.push(slots[i]!);
        i++;
      }
    }

    const baseAssign = assignBySlot[group[0]!.id];
    if (!baseAssign) throw new Error("Missing row config");

    if (readySet != null) {
      // A ready gift set: every row (print place) is its own line — notebook / pen / UV.
      const template = giftSetTemplates.find((x) => x.id === readySet.templateId);
      const { line, paperType } = readySetRowLine(template, readySet, baseAssign.lfCustomerType, null);
      let file: AdminOrderUpdateLineInput["files"][number];
      if (s0.file || s0.linkUrl) {
        onFileStatus?.(s0.id, "uploading");
        const { fileName, fileUrl } = s0.file ? await uploadArtwork(s0.file) : { fileName: s0.linkUrl!, fileUrl: s0.linkUrl! };
        onFileStatus?.(s0.id, "done");
        file = { fileName, fileUrl, copies: readySet.quantity, color: "color", ...(paperType ? { paperType } : {}) };
      } else if (s0.existingFile) {
        file = { fileId: s0.existingFile.id, copies: readySet.quantity, color: "color", ...(paperType ? { paperType } : {}) };
      } else {
        throw new Error("Each row needs a file");
      }
      // A line of the same type keeps its id (a legacy one-line set C becomes new lines).
      const keepId =
        lid != null && !out.some((o) => o.orderLineId === lid) && readySetStoredType.get(lid) === line.productType;
      out.push({ ...line, orderLineId: keepId ? lid : undefined, files: [file] } as AdminOrderUpdateLineInput);
      continue;
    }

    const files: AdminOrderUpdateLineInput["files"] = [];
    for (const slot of group) {
      const a = assignBySlot[slot.id];
      if (!a) throw new Error("Missing row config");

      if (isSheetProductType(a.productType)) {
        // A double-sided run is one line carrying both faces: they are imposed
        // on the same sheet, so splitting them would bill two separate runs.
        // Per-file `copies` stays 1 — the run size lives on the line itself.
        // Untagged legacy files get their side tag written on first save, which
        // pins the face order the editor just showed.
        if (slot.file) {
          onFileStatus?.(slot.id, "uploading");
          const front = await uploadArtwork(slot.file);
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
        } else if (slot.reuse) {
          files.push({
            fileName: slot.reuse.fileName,
            fileUrl: slot.reuse.fileUrl,
            copies: 1,
            color: "color",
            paperType: BUSINESS_CARD_FRONT_PAPER_TYPE,
          });
        } else {
          throw new Error("Each row needs a file");
        }

        if (a.bcSides === "two") {
          if (a.bcBackFile) {
            const back = await uploadArtwork(a.bcBackFile);
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
          } else if (a.bcBackReuse) {
            files.push({
              fileName: a.bcBackReuse.fileName,
              fileUrl: a.bcBackReuse.fileUrl,
              copies: 1,
              color: "color",
              paperType: BUSINESS_CARD_BACK_PAPER_TYPE,
            });
          } else {
            throw new Error("Back artwork required");
          }
        }
        continue;
      }

      if (slot.file || slot.linkUrl || slot.reuse) {
        onFileStatus?.(slot.id, "uploading");
        // A pasted link is stored as is (name = address), like on create;
        // a reused library / stored key as well (no copy).
        const { fileName, fileUrl } = slot.file
          ? await uploadArtwork(slot.file)
          : slot.reuse
            ? { fileName: slot.reuse.fileName, fileUrl: slot.reuse.fileUrl }
            : { fileName: slot.linkUrl!, fileUrl: slot.linkUrl! };
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
        } else if (a.productType === "dtf_apparel") {
          const copies = parseAdminCopiesInput(a.copiesStr);
          if (copies === null) throw new Error("Invalid copies");
          files.push({
            fileName,
            fileUrl,
            copies,
            color: "color",
            paperType: dtfFilePaperType(a, null),
          });
        } else if (a.productType === "uv_print") {
          const copies = parseAdminCopiesInput(a.copiesStr);
          if (copies === null) throw new Error("Invalid copies");
          files.push({
            fileName,
            fileUrl,
            copies,
            color: "color",
            paperType: uvFilePaperType(a, null),
          });
        } else if (a.productType === "sublimation_print") {
          const copies = parseAdminCopiesInput(a.copiesStr);
          if (copies === null) throw new Error("Invalid copies");
          files.push({
            fileName,
            fileUrl,
            copies,
            color: "color",
            paperType: SUBLIMATION_FILE_PAPER_TYPE,
          });
        } else {
          throw new Error("Unknown product");
        }
      } else if (slot.existingFile) {
        const copies = parseAdminCopiesInput(a.copiesStr);
        if (copies === null) throw new Error("Invalid copies");
        if (a.productType === "dtf_apparel") {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: "color",
            paperType: dtfFilePaperType(a, slot.existingFile.paperType),
          });
        } else if (a.productType === "uv_print") {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: "color",
            paperType: uvFilePaperType(a, slot.existingFile.paperType),
          });
        } else if (a.productType === "sublimation_print") {
          files.push({
            fileId: slot.existingFile.id,
            copies,
            color: "color",
            paperType: SUBLIMATION_FILE_PAPER_TYPE,
          });
        } else if (a.productType === "paper_print" && a.paperPrint) {
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
      isSheetProductType(baseAssign.productType)
        ? bcSlotGeometry(baseAssign, bcPaperById)
        : null;
    if (isSheetProductType(baseAssign.productType) && !bcGeometry) {
      throw new Error("Invalid business card line");
    }

    out.push({
      orderLineId,
      productType: baseAssign.productType,
      ...designerUpdateLineFields(baseAssign),
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
          : isSheetProductType(baseAssign.productType)
            ? // Send the run the row has been pricing: rounded up to whole
              // sheets, or the server rejects it as a partial sheet.
              (bcGeometry?.quantity ?? undefined)
            : undefined,
      customerType:
        baseAssign.productType === "large_format_print" ||
        baseAssign.productType === "dtf_apparel" ||
        baseAssign.productType === "uv_print" ||
        baseAssign.productType === "sublimation_print" ||
        isSheetProductType(baseAssign.productType)
          ? baseAssign.lfCustomerType
          : undefined,
      dtf: baseAssign.productType === "dtf_apparel" ? requireDtfInput(baseAssign) : undefined,
      uv: baseAssign.productType === "uv_print" ? requireUvInput(baseAssign) : undefined,
      sublimation:
        baseAssign.productType === "sublimation_print" ? requireSublimationInput(baseAssign) : undefined,
      lfSizePresetId:
        baseAssign.productType === "large_format_print"
          ? baseAssign.lfSizePresetId
          : undefined,
      // Storefront finishing / roll-up set: sent as loaded (the server keeps it either way).
      ...(baseAssign.productType === "large_format_print" && hasLfLineExtras(baseAssign.lfExtras)
        ? { lfFinishing: baseAssign.lfExtras!.finishing ?? null, lfKit: baseAssign.lfExtras!.kit ?? null }
        : {}),
      sheetPaperId:
        isSheetProductType(baseAssign.productType)
          ? (baseAssign.bcSheetPaperId ?? undefined)
          : undefined,
      cardSides:
        isSheetProductType(baseAssign.productType)
          ? baseAssign.bcSides
          : undefined,
      cardPresetId:
        isSheetProductType(baseAssign.productType)
          ? baseAssign.bcPresetId
          : undefined,
      cardTrimWidthCm:
        isSheetProductType(baseAssign.productType)
          ? bcGeometry?.trim.trimWidthCm
          : undefined,
      cardTrimHeightCm:
        isSheetProductType(baseAssign.productType)
          ? bcGeometry?.trim.trimHeightCm
          : undefined,
      sticker:
        baseAssign.productType === "sticker_sheet" && baseAssign.sticker && bcGeometry
          ? stickerLineInput(baseAssign.sticker, bcGeometry.trim)
          : undefined,
      postcard:
        baseAssign.productType === "postcard" && baseAssign.postcard
          ? postcardLineInput(baseAssign.postcard)
          : undefined,
      // Staff «ручная цена» (null clears it); stripped for dealers. A set line is priced by its set.
      ...(baseAssign.giftSet
        ? { set: giftSetLineInput(baseAssign.giftSet), customerType: baseAssign.lfCustomerType }
        : manualPriceLineFields(baseAssign.productType, baseAssign.linePriceStr)),
      designId: baseAssign.designId ?? undefined,
      files,
    });
  }
  // «Набор»: each assembled set's box as its own line (no file), after the set's lines.
  return withGiftSetBoxLines(out, giftSetTemplates, setBoxLineIds);
}

function NewOrderWizard(props: NewOrderPageClientProps) {
  const {
    staffRole,
    fromInvoiceLineItemId = null,
    initialClientId = null,
    initialDesigns = null,
    editOrderId = null,
    repeatOrderId: repeatOrderIdProp = null,
    bootstrap,
    audience = "staff",
  } = props;
  const dealerMode: boolean = audience === "dealer";
  /** «Повторить заказ» (staff, new order only). */
  const repeatOrderId: string | null = dealerMode || editOrderId ? null : repeatOrderIdProp;
  /** Order the wizard hydrates from: the edited one, or the repeated one. */
  const sourceOrderId: string | null = editOrderId ?? repeatOrderId;
  /** Row whose «Из библиотеки» picker is open (`"new"` = add a row). */
  const [libraryPickFor, setLibraryPickFor] = useState<string | null>(null);
  const lfBreakdownFullDetail = !dealerMode && isSuperAdmin(staffRole);
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusOrderLineParam = searchParams.get("line");
  /**
   * Where "cancel" and post-save navigation go. `?returnTo=` lets callers
   * (e.g. the admin client card) bring the user back to where they came
   * from; restricted to /admin/ paths so the param cannot redirect outside.
   */
  const returnToParam = searchParams.get("returnTo");
  const backHref = dealerMode
    ? editOrderId
      ? `/cabinet/orders/${editOrderId}`
      : "/cabinet/orders"
    : returnToParam && returnToParam.startsWith("/admin/")
      ? returnToParam
      : "/admin/orders";
  const { t, locale } = useLanguageStore();
  const { createAdminOrder } = useOrdersStore();

  const [step, setStep] = useState<WizardStep>("files");
  const [slots, setSlots] = useState<AdminWizardSlot[]>(() =>
    sourceOrderId ? [] : [{ id: newSlotId(), sourceOrderLineId: null }],
  );
  const [assignBySlot, setAssignBySlot] = useState<Record<string, SlotAssign>>({});
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  /** Row whose stock item picker (photos, every category and print method) is open, and the tab it opens on. */
  const [stockPicker, setStockPicker] = useState<{ slotId: string; category: string | null } | null>(null);
  /** «Убрать набор» waiting for the in-app confirm: the row clicked, all rows of its set, the set name. */
  const [giftSetRemove, setGiftSetRemove] = useState<{ ids: string[]; name: string } | null>(null);
  /**
   * «Набор» (assembled): an item row about to leave its set — removed (`run`
   * null) or changed to another product type / the client's item (`run` does
   * the change). Confirmed → the set dissolves (`dissolveGiftSet`).
   */
  const [giftSetLeave, setGiftSetLeave] = useState<{ slotId: string; role: GiftSetRole; run: (() => void) | null } | null>(null);
  /** Rows whose «подсказка типа» was answered «Нет, это печать» (for this editing session). */
  const [dismissedTypeHints, setDismissedTypeHints] = useState<ReadonlySet<string>>(() => new Set());

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
    if (step !== "files") setStockPicker(null);
  }, [step]);

  const [customer, setCustomer] = useState<CustomerFormValue>(() =>
    dealerMode ? { ...EMPTY_CUSTOMER_VALUE, customerType: "dealer" } : EMPTY_CUSTOMER_VALUE,
  );
  /** Dealer mode: server price of the order shown on the confirm step. */
  const [dealerQuote, setDealerQuote] = useState<DealerQuoteState>({ status: "idle" });
  /** Staff edit: dealer urgency fee still charged on the order (price field = goods). */
  const [staffUrgencyFeeMdl, setStaffUrgencyFeeMdl] = useState(0);
  /** Dealer mode: «Срочно» checkbox (initialised once from the order / the first quote). */
  const [dealerUrgent, setDealerUrgent] = useState(false);
  const dealerUrgentInitRef = useRef(false);

  const mugProductItems = bootstrap.mugProducts;
  const notebookProductItems = bootstrap.notebookProducts;
  const penProductItems = bootstrap.penProducts;
  const lfMaterialItems = bootstrap.lfMaterials;
  const dtfCatalog: DtfCatalogJson = bootstrap.dtfCatalog;
  const uvCatalog: UvCatalogJson = bootstrap.uvCatalog;
  const sublimationCatalog: SublimationCatalogJson = bootstrap.sublimationCatalog;
  const designerCatalogs: DesignerLineCatalogs = useMemo(
    () => ({ uv: uvCatalog, sublimation: sublimationCatalog }),
    [uvCatalog, sublimationCatalog],
  );
  /** «Набор»: templates and the catalogs its items are picked from. */
  const giftSetTemplates: readonly GiftSetTemplate[] = useMemo(() => bootstrap.giftSetTemplates ?? [], [bootstrap.giftSetTemplates]);
  const giftSetCatalogs: GiftSetCatalogs = useMemo(
    () => ({ uv: uvCatalog.items, sublimation: sublimationCatalog.items }),
    [uvCatalog, sublimationCatalog],
  );
  const [giftSetDialog, setGiftSetDialog] = useState<{ slotId: string; initial: GiftSetChoice | null } | null>(null);
  /** Edit: product type of each stored line (a ready-set row keeps its line id only on a line of its type). */
  const storedLineTypesRef = useRef<Map<string, string>>(new Map());
  /** «Набор»: stored box line id by set group (edit: the box line is not a row; it keeps its id on save). */
  const setBoxLineIdsRef = useRef<Map<string, string>>(new Map());
  /** «Набор»: stock unit the saved order already holds per set group (box / set item SKU × N): the stock row counts it as available. */
  const savedSetUnitRef = useRef<Map<string, { sku: string | null; variantId: string | null; quantity: number }>>(new Map());
  /** Edit mode: what each saved set actually holds on the stock ledger (group id → variant id / `box:<SKU>` → units). */
  const savedSetHeldRef = useRef<Map<string, Map<string, number>> | null>(null);
  const methodTitle = useCallback(
    (m: StockMethod): string => getProductTypeConfig(m)?.getTitle(t) ?? m,
    [t],
  );
  /** Every UV, sublimation and DTF stock item: product menu tiles and the item picker. */
  const stockEntries: StockMenuEntry[] = useMemo(
    () =>
      buildStockMenuEntries({
        uv: uvCatalog.items,
        sublimation: sublimationCatalog.items,
        dtf: dtfCatalog.garments,
      }).map((e) => ({
        ...e,
        methodLabel: e.methods.map(methodTitle).join(" / "),
        note: e.methods[0] === "dtf_apparel" ? "" : undefined,
      })),
    [uvCatalog, sublimationCatalog, dtfCatalog, methodTitle],
  );
  const stockMenuTiles: ProductMenuStockCategory[] = useMemo(
    () =>
      stockMenuCategories(stockEntries)
        // The bought-in gift set is ordered through «Набор» only (still listed in «Склад»).
        .filter((c) => c.code !== GIFT_SET_CATEGORY_CODE)
        .map((c) => ({
        code: c.code,
        title: stockCategoryName(c, locale),
        count: c.count,
        imageUrl: c.imageUrl,
      })),
    [stockEntries, locale],
  );
  const clientServiceTiles: ProductMenuClientService[] = useMemo(
    () => [
      { type: "uv_print", title: t.productPicker.clientUv, hint: t.productPicker.clientUvHint },
      {
        type: "uv_print",
        id: UV_DTF_STICKERS_SERVICE,
        title: t.productPicker.uvDtfStickers,
        hint: t.productPicker.uvDtfStickersHint,
      },
      { type: "sublimation_print", title: t.productPicker.clientSublimation, hint: t.productPicker.clientSublimationHint },
      { type: "dtf_apparel", title: t.productPicker.clientDtf, hint: t.productPicker.clientDtfHint },
    ],
    [t],
  );

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
    bootstrap.sheetPapers.find((p) => !isStickerSheetPaper(p))?.id ?? null,
  );
  bcDefaultSheetPaperIdRef.current = bootstrap.sheetPapers.find((p) => !isStickerSheetPaper(p))?.id ?? null;
  wizardStickerSettings = bootstrap.stickerSheetSettings ?? STICKER_SHEET_DEFAULTS;
  wizardPostcardSettings = bootstrap.postcardSettings ?? POSTCARD_DEFAULTS;
  const dtfCatalogRef = useRef<DtfCatalogJson>(dtfCatalog);
  dtfCatalogRef.current = dtfCatalog;
  const uvCatalogRef = useRef<UvCatalogJson>(uvCatalog);
  uvCatalogRef.current = uvCatalog;
  const sublimationCatalogRef = useRef<SublimationCatalogJson>(sublimationCatalog);
  sublimationCatalogRef.current = sublimationCatalog;

  // Keep lfMaterialId aligned with min-sufficient billing roll when a family
  // is selected and dimensions are known (preview / validation / price).
  // DTF lines with the same layout share run-size prices: keep each draft's
  // layout run quantity equal to the pieces of its layout across the order.
  useEffect(() => {
    setAssignBySlot((prev) => {
      const runs = dtfDraftLayoutRuns(Object.values(prev).map((a) => (a.productType === "dtf_apparel" ? a.dtf : null)));
      let changed = false;
      const next = { ...prev };
      for (const [slotId, a] of Object.entries(prev)) {
        if (a.productType !== "dtf_apparel" || !a.dtf) continue;
        const want: number | undefined = a.dtf.layoutKey ? runs.get(a.dtf.layoutKey) : undefined;
        if (a.dtf.layoutRunQuantity === want) continue;
        next[slotId] = { ...a, dtf: { ...a.dtf, layoutRunQuantity: want } };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [assignBySlot]);

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
  }, [lfFamilyBillingSyncKey]);

  const printEconomics: WizardBootstrapData["printEconomics"] | null =
    bootstrap.printEconomics;

  /** Business cards / flyers choose among the ordinary papers; stickers use the self-adhesive one. */
  const bcPaperItems = useMemo(
    () => bootstrap.sheetPapers.filter((p) => !isStickerSheetPaper(p)),
    [bootstrap.sheetPapers],
  );
  const stickerPaperItems = useMemo(
    () => bootstrap.sheetPapers.filter((p) => isStickerSheetPaper(p)),
    [bootstrap.sheetPapers],
  );
  const stickerPaperId: string | null = stickerPaperItems[0]?.id ?? null;
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
  const [editLoading, setEditLoading] = useState(Boolean(sourceOrderId));
  const [editLoadError, setEditLoadError] = useState("");
  /** The edited order does not exist (or was deleted): show «Заказ не найден» instead of an empty form. */
  const [editNotFound, setEditNotFound] = useState(false);
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
  /**
   * Measured size of each business-card artwork face (`null` = undecodable).
   * Keyed by the file itself, not the row, so changing the card size re-judges
   * instantly without downloading a stored file again.
   */
  const [bcArtworkSizes, setBcArtworkSizes] = useState<
    ReadonlyMap<BcArtworkKey, BusinessCardSizeCm | null>
  >(() => new Map());
  const bcArtworkMeasuringRef = useRef(new Set<BcArtworkKey>());

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
    if (!sourceOrderId) {
      setEditLoading(false);
      setEditLoadError("");
      return;
    }

    let cancelled = false;
    setEditLoading(true);
    setEditLoadError("");

    setEditNotFound(false);

    // «Повторить заказ»: which of the order's files can be reused (library / storage).
    let repeatFiles: Record<string, WizardReusedFile | null> | null = null;
    let repeatMissingPhotos: Record<string, string[]> = {};
    const repeatFilesPromise = repeatOrderId
      ? loadRepeatOrderFiles(repeatOrderId).then((m) => {
          repeatFiles = m.files;
          repeatMissingPhotos = m.missingPhotos;
        })
      : Promise.resolve();

    // Dealers reopen their own order from a cost-free prefill (409 once printing started).
    fetch(dealerMode ? `/api/cabinet/orders/${sourceOrderId}/edit` : `/api/admin/orders/${sourceOrderId}`)
      .then(async (res) => {
        await repeatFilesPromise;
        if (dealerMode && res.status === 409) throw new Error(DEALER_ORDER_LOCKED_CODE);
        if (res.status === 404) {
          if (!cancelled) {
            setEditNotFound(true);
            setEditLoading(false);
          }
          return null;
        }
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || res.statusText);
        }
        return res.json() as Promise<{
          /** "shop" for storefront orders (not editable here). */
          source?: string;
          phone: string;
          clientName: string | null;
          clientId: string | null;
          notes: string | null;
          price: number | null;
          /** Staff GET only: dealer urgency fee still charged (inside `price`). */
          dealerUrgencyFeeMdl?: number;
          studioClient: CustomerFormValue["selectedClient"];
          /** «Набор»: units each saved set holds on the stock ledger. */
          giftSetStockHeld?: Array<{ setGroupId: string; variantId: string; sku: string; quantity: number }>;
          orderLines: Array<{
            id: string;
            sortOrder: number;
            productType: string;
            /** Mug / pen / notebook variant of the unified stock (the id the picker uses). */
            stockVariantId?: string | null;
            largeFormatMaterialId?: string | null;
            largeFormatLineData?: unknown;
            sheetPaperId?: string | null;
            businessCardLineData?: unknown;
            dtfLineData?: unknown;
            uvLineData?: unknown;
            sublimationLineData?: unknown;
            mugProductSnapshot?: unknown;
            notebookProductSnapshot?: unknown;
            penProductSnapshot?: unknown;
            mugLayoutData: unknown;
            notebookLayoutData: unknown;
            penLayoutData?: unknown;
            /** Paper / mug / notebook / pen: staff «ручная цена» per piece. */
            manualUnitPriceMdl?: number | string | null;
            /** «Набор»: set group id + set data. */
            setGroupId?: string | null;
            setData?: unknown;
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
        if (cancelled || !order) return;
        if (order.source === "shop") {
          setEditLoadError(SHOP_ORDER_EDIT_BLOCKED_MESSAGE);
          setEditLoading(false);
          return;
        }
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
        /** Row → line of the hydrated order it came from. */
        const slotRepeatSourceLine = new Map<string, string>();

        // «Набор»: units the saved order could not take (short → «Закупка»): not held.
        const shortVariantIds = procurementVariantIds(
          Boolean((order as { needsProcurement?: boolean }).needsProcurement),
          (order as { procurementMeta?: unknown }).procurementMeta,
        );
        // «Набор»: the ledger says what each saved set holds (short → nothing to add back).
        if (editOrderId) savedSetHeldRef.current = giftSetSavedHeldMap(order.giftSetStockHeld ?? []);
        for (const line of lines) {
          // «Набор»: what this set already took from stock (stock line; older orders: the first line).
          const heldSet = line.setGroupId ? parseOrderLineSetData(line.setData) : null;
          const heldSku = heldSet ? (heldSet.boxSku ?? heldSet.setItemSku ?? null) : null;
          // One-line ready set (v1): the set item is the UV line's own stock item.
          const legacyVariantId =
            heldSet && isLegacyReadySetLine(heldSet) ? (parseUvLineData(line.uvLineData)?.item?.variantId ?? null) : null;
          const heldVariantId = line.stockVariantId ?? legacyVariantId;
          const heldShort = Boolean(heldVariantId && shortVariantIds.has(heldVariantId));
          // Only an edit gets this order's stock back; a repeat is a new order.
          if (editOrderId && line.setGroupId && heldSet && (heldSku || legacyVariantId) && !heldShort) {
            savedSetUnitRef.current.set(line.setGroupId, { sku: heldSku, variantId: heldVariantId, quantity: heldSet.quantity });
          }
          // «Набор»: the stock line is not a row (no file) — the wizard sends it again with its set.
          if (isGiftSetBoxLineType(line.productType)) {
            if (line.setGroupId) setBoxLineIdsRef.current.set(line.setGroupId, line.id);
            storedLineTypesRef.current.set(line.id, line.productType);
            continue;
          }
          const lineSet = line.setGroupId ? parseOrderLineSetData(line.setData) : null;
          // A ready gift set: its files in the order of the set's print places (thermos, notebook, pen).
          const zoneRank = (f: { paperType: string | null }): number => {
            const z = uvZoneIdFromPaperType(f.paperType);
            const k = z ? (lineSet?.zoneIds ?? []).indexOf(z) : -1;
            return k === -1 ? 99 : k;
          };
          const { rowFiles, businessCardBack } = wizardRowFilesForLine(
            line.productType,
            [...line.files].sort((a, b) =>
              lineSet?.kind === "ready" ? zoneRank(a) - zoneRank(b) : a.fileName.localeCompare(b.fileName),
            ),
          );
          storedLineTypesRef.current.set(line.id, line.productType);
          for (const [rowIdx, f] of rowFiles.entries()) {
            const sid = newSlotId();
            slotRepeatSourceLine.set(sid, line.id);
            if (repeatFiles) {
              // A new order: reuse what is still stored, flag the rest. A
              // multi-file line becomes one row per file, as the server stores
              // new orders (`expandToOneFilePerLine`).
              const reused: WizardReusedFile | null = repeatFiles[f.id] ?? null;
              nextSlots.push({
                id: sid,
                reuse: reused ?? undefined,
                missingFileName: reused ? undefined : f.fileName,
                sourceOrderLineId: null,
              });
            } else {
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
            }
            const base = defaultAssign(
              mugs,
              nbs,
              pens,
              lfMaterialItemsRef.current[0]?.id ?? null,
              // Dealers: every row is priced at the dealer tier from the start.
              dealerMode ? "dealer" : "retail",
              bcDefaultSheetPaperIdRef.current,
            );
            const pt = line.productType as ProductType;
            base.productType = pt;
            base.copiesStr = String(f.copies);
            base.linePriceStr = "";
            // Staff «ручная цена» saved on the line comes back into the price field:
            // per piece on every row, a line total on the line's first row only.
            if (!dealerMode) {
              const storedManual: number | null = isManualUnitPriceType(pt)
                ? storedManualUnitPriceMdl(line.manualUnitPriceMdl)
                : rowIdx === 0 && isManualTotalSnapshotType(pt)
                  ? storedManualLineTotalMdl(
                      pt === "large_format_print"
                        ? line.largeFormatLineData
                        : pt === "dtf_apparel"
                          ? line.dtfLineData
                          : pt === "uv_print"
                            ? line.uvLineData
                            : line.sublimationLineData,
                    )
                  : null;
              if (storedManual != null) base.linePriceStr = String(storedManual);
            }
            if (pt === "paper_print") {
              base.paperPrint = paperPrintFromStoredFile(f);
            } else {
              base.paperPrint = null;
            }
            if (pt === "mug") {
              // Mug ids are unified variant ids.
              const mugId: string | null = line.stockVariantId ?? null;
              base.mugPick =
                mugId != null
                  ? { type: "catalog", productId: mugId }
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
              // Notebook ids are unified variant ids.
              const nbId: string | null = line.stockVariantId ?? null;
              base.nbPick =
                nbId != null
                  ? { type: "catalog", productId: nbId }
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
              // Pen ids are unified variant ids.
              const penId: string | null = line.stockVariantId ?? null;
              base.penPick =
                penId != null
                  ? { type: "catalog", productId: penId }
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
                base.lfExtras =
                  lfd.finishing || lfd.kit ? { finishing: lfd.finishing?.input ?? null, kit: lfd.kit?.id ?? null } : null;
              }
            }
            if (isSheetProductType(pt)) {
              const bcd = parseBusinessCardLineData(line.businessCardLineData);
              base.bcSheetPaperId =
                line.sheetPaperId ?? bcd?.paperSnapshot.id ?? null;
              base.bcBackExistingFile =
                businessCardBack != null && !repeatFiles
                  ? {
                      id: businessCardBack.id,
                      fileName: businessCardBack.fileName,
                    }
                  : null;
              base.bcBackReuse =
                businessCardBack != null && repeatFiles ? (repeatFiles[businessCardBack.id] ?? null) : null;
              if (bcd) {
                // Staff «ручная цена» saved on the line comes back into the price field.
                const storedManual = storedManualSheetLineTotalMdl(bcd);
                if (storedManual != null && !dealerMode) base.linePriceStr = String(storedManual);
                base.copiesStr = pt === "sticker_sheet" ? stickerCopiesStrFromLineData(bcd) : String(bcd.quantity);
                if (pt === "sticker_sheet") base.sticker = stickerDraftFromLineData(bcd);
                if (pt === "postcard") base.postcard = postcardDraftFromLineData(bcd);
                base.bcSides = bcd.sides;
                base.lfCustomerType = bcd.customerType;
                const trim = businessCardTrimSize(bcd);
                base.bcPresetId = bcd.presetId ?? "custom";
                base.bcTrimWidthStr = String(trim.widthCm);
                base.bcTrimHeightStr = String(trim.heightCm);
                base.bcStored = {
                  productType: pt,
                  sheetPaperId: base.bcSheetPaperId,
                  quantity: bcd.quantity,
                  sides: bcd.sides,
                  customerType: bcd.customerType,
                  trimWidthCm: trim.widthCm,
                  trimHeightCm: trim.heightCm,
                  // The calculated price (a manual one lives in the price field).
                  totalSellPriceMdl: withoutManualSheetLinePrice(bcd).totalSellPriceMdl,
                  pricePerSheetMdl: bcd.pricePerSheetMdl,
                  pricePerCardMdl: bcd.pricePerCardMdl ?? null,
                  sticker: bcd.stickerSheet
                    ? { shape: bcd.stickerSheet.shape, cut: bcd.stickerSheet.cut, format: bcd.stickerSheet.format }
                    : null,
                  postcardKey: postcardPricingKey(bcd.postcard),
                };
              }
            }
            if (lineSet && line.setGroupId) {
              // «Набор»: the row keeps its set; its price comes from the set, not the price field.
              const ready = lineSet.kind === "ready";
              base.giftSet = giftSetRowFromLine(line.setGroupId, lineSet, {
                zoneId: ready ? (uvZoneIdFromPaperType(f.paperType) ?? undefined) : undefined,
                readyVariantId: ready ? (parseUvLineData(line.uvLineData)?.item?.variantId ?? undefined) : undefined,
              });
              // «Повторить заказ» is a new order: today's template price (the server has no stored price for it).
              if (repeatFiles) base.giftSet = { ...base.giftSet, savedPrice: null };
              base.copiesStr = String(lineSet.quantity);
              base.linePriceStr = "";
              base.lfCustomerType = lineSet.customerType;
              if (ready) {
                // Wizard-side a ready-set row is a «print place» row (saved as notebook / pen / UV).
                base.productType = "uv_print";
                base.uv = null;
                nextAssign[sid] = base;
                continue;
              }
            }
            if (pt === "dtf_apparel") {
              const dtfData = parseDtfLineData(line.dtfLineData);
              if (dtfData) {
                base.dtf = dtfDraftFromLineData(dtfData, dtfCatalogRef.current);
                base.lfCustomerType = dtfData.customerType;
              }
              nextAssign[sid] = withDtfDraft(base, dtfCatalogRef.current);
              continue;
            }
            if (pt === "uv_print") {
              const uvData = parseUvLineData(line.uvLineData);
              if (uvData) {
                base.uv = uvDraftFromLineData(uvData);
                base.lfCustomerType = uvData.customerType;
              }
              nextAssign[sid] = withUvDraft(base, uvCatalogRef.current);
              continue;
            }
            if (pt === "sublimation_print") {
              const sublData = parseSublimationLineData(line.sublimationLineData);
              if (sublData) {
                base.sublimation = sublimationDraftFromLineData(sublData);
                base.lfCustomerType = sublData.customerType;
              }
              nextAssign[sid] = withSublimationDraft(base, sublimationCatalogRef.current);
              continue;
            }
            nextAssign[sid] = base;
          }
        }

        // A repeated order is priced at today's rates: drop the sold-price snapshots.
        // Layout photos gone from storage leave the mug / notebook / pen layout (with a warning).
        if (repeatFiles) {
          for (const sl of nextSlots) {
            const lineId = slotRepeatSourceLine.get(sl.id);
            const missing = lineId ? repeatMissingPhotos[lineId] : undefined;
            const a = nextAssign[sl.id];
            if (!missing?.length || !a) continue;
            const gone = new Set(missing);
            const mug = withoutMissingLayoutPhotos(a.mugLayoutData ?? undefined, gone);
            const nb = withoutMissingLayoutPhotos(a.notebookLayoutData ?? undefined, gone);
            const pen = withoutMissingLayoutPhotos(a.penLayoutData ?? undefined, gone);
            const removed = mug.removed + nb.removed + pen.removed;
            if (removed === 0) continue;
            nextAssign[sl.id] = {
              ...a,
              mugLayoutData: mug.layout ?? a.mugLayoutData,
              notebookLayoutData: nb.layout ?? a.notebookLayoutData,
              penLayoutData: pen.layout ?? a.penLayoutData,
            };
            sl.expiredPhotoCount = removed;
          }
          for (const sid of Object.keys(nextAssign)) nextAssign[sid] = { ...nextAssign[sid]!, bcStored: null };
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
        const chosenTier: LargeFormatCustomerType = dealerMode
          ? "dealer"
          : order.studioClient
          ? order.studioClient.isDealer
            ? "dealer"
            : "retail"
          : lfTiers[0] ?? "retail";

        setSlots(nextSlots);
        setAssignBySlot(nextAssign);
        const staffFee = dealerMode || repeatFiles ? 0 : (order.dealerUrgencyFeeMdl ?? 0);
        setStaffUrgencyFeeMdl(staffFee);
        setCustomer({
          ...EMPTY_CUSTOMER_VALUE,
          phone: order.phone,
          clientName: order.clientName ?? "",
          // A repeat starts with an empty comment and a calculated price.
          notes: repeatFiles ? "" : (order.notes ?? ""),
          // Dealer urgency fee still charged: the field is the goods price (price − fee);
          // the server adds the fee back on save.
          priceStr:
            !repeatFiles && order.price != null && Number.isFinite(Number(order.price))
              ? round2(Number(order.price) - staffFee).toFixed(2)
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
    // `dealerMode` is fixed for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceOrderId]);

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

  // Dealer cabinet: the tier is fixed to «dealer», so the mirror above never
  // re-runs after rows are (re)hydrated (edit prefill, repeat, new rows). Keep
  // every row on the dealer tier so step 1 shows the same prices the server
  // quotes on the confirm step — never retail prices.
  useEffect(() => {
    if (!dealerMode) return;
    if (Object.values(assignBySlot).every((a) => a.lfCustomerType === "dealer")) return;
    setAssignBySlot((prev) => {
      const next: Record<string, SlotAssign> = {};
      for (const [id, a] of Object.entries(prev)) {
        next[id] = a.lfCustomerType === "dealer" ? a : { ...a, lfCustomerType: "dealer" };
      }
      return next;
    });
  }, [dealerMode, assignBySlot]);

  // Design Studio prefill is a staff feature (admin designs API).
  const designsParam = dealerMode ? null : (searchParams.get("designs") ?? initialDesigns);
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
    () => new Map(bootstrap.sheetPapers.map((p) => [p.id, p])),
    [bootstrap.sheetPapers],
  );
  const bcMinimumLineTotalMdlEffective =
    printEconomics?.bcMinimumLineTotalMdl ?? 0;

  // ── Cross-line packing preview ─────────────────────────────────────────
  // Groups same-family (or, for concrete rolls, same-material — two or more
  // slots, no size preset) + same-customer-type LF slots and computes ONE
  // combined layout + pricing. Mirrors server-side `groupLinesForPacking`. Different customer types (dealer vs retail)
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
      {
        infos: SlotInfo[];
        members: AdminLargeFormatMaterialJson[];
        /** Concrete-roll group: only billed together with 2+ slots. */
        concrete: boolean;
      }
    >();

    for (const s of slots) {
      const a = assignBySlot[s.id];
      if (!a || a.productType !== "large_format_print") continue;
      const sv =
        a.lfSelectionValue ??
        (a.lfMaterialId ? `material:${a.lfMaterialId}` : null);
      const sel = parseSelectionValue(sv);
      if (!sel.id) continue;
      const concrete = sel.type === "material";
      if (!concrete && sel.type !== "family") continue;
      // Size presets lock the line price — never pooled.
      if (concrete && a.lfSizePresetId) continue;

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
      const members = lfMaterialItems.filter((m) =>
        concrete ? m.id === sel.id : lfMaterialFamilyKey(m.name) === sel.id,
      );
      if (members.length === 0) continue;
      const galleryWrapCm = resolveGalleryWrapCm(members[0]!.name);
      const effW = w + 2 * galleryWrapCm;
      const effH = h + 2 * galleryWrapCm;

      // Composite key: same family AND same customer type share a group.
      // Mirrors server-side `groupLinesForPacking`.
      const groupKey = `${concrete ? "material:" : ""}${sel.id}::${a.lfCustomerType}`;
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
          concrete,
        });
      }
    }

    for (const [, { infos, members, concrete }] of familyGroupsMap) {
      // Include single-line families too — cheapest-roll may still differ
      // from the narrowest sufficient (e.g. rotation-friendly wider roll).
      // A lone concrete-roll slot keeps its own single-line price.
      if (infos.length === 0) continue;
      if (concrete && infos.length < 2) continue;

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
        catalogCostPerLm: groupMat.costPerLinearMeter,
        avgCostPerLm: groupMat.avgPurchaseCostPerLinearMeter,
      });

      // Per-slot pricing, step for step like the server's
      // `computeLargeFormatLineGroupBilling`: allocate LM by tile area, price
      // each slot (material + ink, each rounded per slot), then lift the group
      // to the retail minimum. Rounding the group total once instead drifts
      // a few MDL from the price the server stores.
      const pe = lfPrintEconomicsPayload;
      const slotPricings: LfMaterialPricingResult[] = infos.map((info, idx) => {
        const slotArea = pack.placements
          .filter((p) => p.tileId.startsWith(`S${idx}::`))
          .reduce((sum, p) => sum + p.widthCm * p.heightCm, 0);
        const lineLm = totalArea > 0 ? totalLm * (slotArea / totalArea) : 0;
        const pricingMat = computeLargeFormatLinePricing({
          calculatedLinearMeters: lineLm,
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
        if (!pe) return mergeLfPricingWithInkSell(pricingMat, 0);
        const econ = computeLfRollOrderEconomics({
          printWidthCm: info.effW,
          printHeightCm: info.effH,
          quantity: info.quantity,
          calculatedLinearMeters: lineLm,
          rollWidthMeters: Number(groupMat.rollWidthMeters),
          effectiveMaterialCostPerLinearMeterMdl: effCostLm,
          inkMlPerSqm: pe.inkMlPerSqmLargeFormatRoll,
          avgInkCostPerMlMdl: pe.avgInkCostPerMlMdl,
          totalSellPriceMdl: pricingMat.materialSellPrice,
        });
        return mergeLfPricingWithInkSell(
          pricingMat,
          computeLfInkSellPriceMdl(econ.inkCostMdl, customerType, pe),
        );
      });
      const { pricings: finalPricings } = applyGroupMinimumSellTotal(
        slotPricings,
        customerType === "dealer" ? 0 : lfMinimumLineTotalMdlEffective,
      );

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
        const slotPrice = finalPricings[idx]!.totalSellPrice;

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

  /** «Набор»: line total of every set row (the set price split as the server bills it). */
  /** «Набор»: stock row of each set (A/B box, C set item), by the slot it follows. */
  const giftSetVariantInfo = useMemo(
    () => new Map(uvCatalog.items.map((i) => [i.id, { sku: i.sku, label: i.variantLabel?.trim() || null }])),
    [uvCatalog],
  );
  const giftSetBoxRowsBySlot: Map<string, GiftSetBoxRow> = useMemo(
    () =>
      giftSetBoxRows(
        slots.map((x) => ({ slotId: x.id, giftSet: assignBySlot[x.id]?.giftSet })),
        giftSetTemplates,
        giftSetVariantInfo,
      ),
    [slots, assignBySlot, giftSetTemplates, giftSetVariantInfo],
  );
  const giftSetTotals: Map<string, number> = useMemo(
    () =>
      giftSetRowTotals(
        slots.map((x) => ({ slotId: x.id, giftSet: assignBySlot[x.id]?.giftSet })),
        giftSetTemplates,
        dealerMode ? "dealer" : customer.customerType,
        { allowManualPrice: !dealerMode },
      ),
    [slots, assignBySlot, giftSetTemplates, dealerMode, customer.customerType],
  );

  /** Line total of one row as the wizard prices it (set share, manual price, LF group share or catalog quote). */
  const slotLineTotalMdl = useCallback(
    (slotId: string): number => {
      const a = assignBySlot[slotId];
      if (!a) return 0;
      const setTotal: number | undefined = giftSetTotals.get(slotId);
      if (setTotal !== undefined) return setTotal;
      const groupData = lfFamilyGroupData.get(slotId);
      if (
        groupData &&
        a.productType === "large_format_print" &&
        !parsedLinePriceMdl(a.linePriceStr)
      ) {
        return groupData.slotTotalPriceMdl;
      }
      return effectiveLineTotalMdl(
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
        dtfCatalog,
        uvCatalog,
        sublimationCatalog,
      );
    },
    [
      dtfCatalog,
      uvCatalog,
      sublimationCatalog,
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
      giftSetTotals,
    ],
  );

  const orderLinesSubtotalMdl = useMemo(
    () => slots.reduce((sum, s) => sum + slotLineTotalMdl(s.id), 0),
    [slots, slotLineTotalMdl],
  );

  /**
   * Row the catalog cannot price (the studio sets its price): paper print,
   * sheet paper without a price per sheet, UV / sublimation print without a
   * rate, a mug / notebook / pen off the catalog or without a price. A row
   * that is simply not filled in yet is not one of them.
   */
  const slotHasNoPrice = useCallback(
    (slotId: string): boolean => {
      const a = assignBySlot[slotId];
      if (!a || a.giftSet || parsedLinePriceMdl(a.linePriceStr) !== null) return false;
      if (a.productType === "paper_print") return true;
      if (isSheetProductType(a.productType)) {
        const pricing = bcSlotPricing(a, bcPaperById, bcMinimumLineTotalMdlEffective);
        return pricing != null && !(pricing.pricePerSheetMdl > 0);
      }
      if (a.productType === "uv_print") {
        const quote = uvSlotQuote(a, uvCatalog);
        return quote != null && !quote.ok && quote.code === "uv_price_not_set";
      }
      if (a.productType === "sublimation_print") {
        const quote = sublimationSlotQuote(a, sublimationCatalog);
        return quote != null && !quote.ok && quote.code === "subl_price_not_set";
      }
      if (a.productType === "mug" || a.productType === "notebook" || a.productType === "pen") {
        const pick = a.productType === "mug" ? a.mugPick : a.productType === "notebook" ? a.nbPick : a.penPick;
        if (!pick) return false;
        if (pick.type !== "catalog") return true;
        return Boolean(pick.productId) && catalogUnitMdl(a, mugById, nbById, penById, uvCatalog) === null;
      }
      return false;
    },
    [
      assignBySlot,
      bcPaperById,
      bcMinimumLineTotalMdlEffective,
      uvCatalog,
      sublimationCatalog,
      mugById,
      nbById,
      penById,
    ],
  );
  const anySlotHasNoPrice: boolean = slots.some((s) => slotHasNoPrice(s.id));

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

  // Edit mode: while the order price equals the sum of the lines, it follows
  // them when a line changes (a manual line price, another run…). A price the
  // staff set apart from the lines is left alone, as above.
  const editSubtotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editOrderId || dealerMode) return;
    if (editLoading) {
      editSubtotalRef.current = null;
      return;
    }
    const prevSubtotal = editSubtotalRef.current;
    editSubtotalRef.current = orderLinesSubtotalMdl;
    if (
      prevSubtotal == null ||
      !(orderLinesSubtotalMdl > 0) ||
      Math.abs(orderLinesSubtotalMdl - prevSubtotal) < 0.005
    ) {
      return;
    }
    setCustomer((prev) => {
      const current = parseAmountMdl(prev.priceStr);
      if (current == null || Math.abs(current - round2(prevSubtotal)) >= 0.005) return prev;
      return { ...prev, priceStr: round2(orderLinesSubtotalMdl).toFixed(2) };
    });
  }, [orderLinesSubtotalMdl, editOrderId, editLoading, dealerMode]);

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

  /** First slot per line key — `?line=` scroll anchor targets this row. */
  const firstSlotIdByLineKey = useMemo(() => {
    const leaders = new Map<string, string>();
    for (const slot of slots) {
      const lk = wizardLineKey(slot);
      if (!leaders.has(lk)) leaders.set(lk, slot.id);
    }
    return leaders;
  }, [slots]);

  /** DTF row `id` takes the layout of row `otherId` (null: its own layout). */
  function setDtfSameLayout(id: string, otherId: string | null): void {
    setAssignBySlot((prev) => {
      const row = prev[id];
      if (!row?.dtf) return prev;
      if (otherId == null) {
        return { ...prev, [id]: { ...row, dtf: { ...row.dtf, layoutKey: undefined } } };
      }
      const other = prev[otherId];
      if (!other?.dtf) return prev;
      const key: string = other.dtf.layoutKey ?? newDtfLayoutKey();
      return {
        ...prev,
        [otherId]: { ...other, dtf: { ...other.dtf, layoutKey: key } },
        [id]: { ...row, dtf: { ...row.dtf, layoutKey: key } },
      };
    });
  }

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
      let next: SlotAssign = withPostcardDraft(withStickerDraft(
        withSheetProductPreset({
          ...mergedWithPrice,
          paperPrint,
          lfMaterialId,
        }),
        stickerPaperId,
        bcDefaultSheetPaperId,
      ));
      // Keep the run on whole sheets when the sheet capacity changes. Custom
      // width/height are left out: refitting on every keystroke would jump the
      // run through the half-typed sizes; it is rounded on blur and submit.
      if (
        isSheetProductType(pt) &&
        (productTypeChanged ||
          patch.bcSheetPaperId !== undefined ||
          patch.bcPresetId !== undefined)
      ) {
        next = bcWithWholeSheetQuantity(next, bcPaperById, "refit");
      }
      next = withDtfDraft(next, dtfCatalog);
      next = withUvDraft(next, uvCatalog);
      next = withSublimationDraft(next, sublimationCatalog);
      // A pen / notebook (UV) or mug (sublimation) picked → that product's own line.
      next = convertPickedDesignerItem(prevRow, next, designerCatalogs);
      return { ...prev, [id]: next };
    });
  }

  /** Item picked in the «UV-печать · Ручка» header of a pen / notebook / mug row. */
  function pickSlotPrintMethodItem(
    id: string,
    pick: Parameters<typeof pickPrintMethodItem>[2],
  ): void {
    setAssignBySlot((prev) => {
      const cur = prev[id];
      const method = cur ? printMethodForDesignerProduct(cur.productType) : null;
      if (!cur || !method) return prev;
      return { ...prev, [id]: pickPrintMethodItem(cur, method, pick, designerCatalogs) };
    });
  }

  /**
   * Stock item picked for a row (product menu category → item picker): the row
   * becomes that item's print-method line — or its pen / notebook / mug line.
   * `method` picks one of several print methods of the item (default: the first).
   */
  function pickSlotStockItem(slotId: string, entryId: string, method?: StockMethod): void {
    const entry: StockMenuEntry | undefined = stockEntries.find((e) => e.id === entryId);
    const row = assignBySlot[slotId];
    if (!entry || !row) return;
    const m: StockMethod = method && entry.methods.includes(method) ? method : entry.methods[0]!;
    if (m === "dtf_apparel") {
      const base: DtfDraft = row.productType === "dtf_apparel" && row.dtf ? row.dtf : emptyDtfDraft(dtfCatalog);
      updateSlot(slotId, { productType: "dtf_apparel", dtf: withDtfGarment(base, dtfCatalog, "stock", entry.id) });
      return;
    }
    // Leave paper / large-format / DTF rows the way the product menu does, then pick the item.
    if (row.productType !== m && !isDesignerProductType(row.productType)) updateSlot(slotId, { productType: m });
    setAssignBySlot((prev) => {
      const cur = prev[slotId];
      if (!cur) return prev;
      let next = pickPrintMethodItem(cur, m, { source: "stock", variantId: entry.id }, designerCatalogs);
      if (next.productType === "sublimation_print" && next.sublimation && next.sublimation.source !== "stock") {
        next = {
          ...next,
          sublimation: { ...withSublimationSource(next.sublimation, sublimationCatalog, "stock"), variantId: entry.id },
        };
      }
      return { ...prev, [slotId]: next };
    });
  }

  /** «Печать на изделии клиента» picked for a row: the print-method line with the client's own item. */
  function pickSlotClientService(slotId: string, type: string): void {
    const row = assignBySlot[slotId];
    if (!row) return;
    if (type === UV_DTF_STICKERS_SERVICE) {
      const base: UvDraft = row.productType === "uv_print" && row.uv ? row.uv : emptyUvStickersDraft();
      updateSlot(slotId, { productType: "uv_print", uv: withUvItem(base, uvCatalog, "stickers", null) });
    } else if (type === "uv_print") {
      const base: UvDraft = row.productType === "uv_print" && row.uv ? row.uv : emptyWizardUvDraft(uvCatalog);
      updateSlot(slotId, { productType: "uv_print", uv: withUvItem(base, uvCatalog, "client", null) });
    } else if (type === "sublimation_print") {
      const base: SublimationDraft =
        row.productType === "sublimation_print" && row.sublimation
          ? row.sublimation
          : emptyWizardSublimationDraft(sublimationCatalog);
      updateSlot(slotId, {
        productType: "sublimation_print",
        sublimation: withSublimationSource(base, sublimationCatalog, "client"),
      });
    } else if (type === "dtf_apparel") {
      const base: DtfDraft = row.productType === "dtf_apparel" && row.dtf ? row.dtf : emptyDtfDraft(dtfCatalog);
      updateSlot(slotId, { productType: "dtf_apparel", dtf: withDtfGarment(base, dtfCatalog, "client", null) });
    }
  }

  /**
   * «Подсказка типа» accepted: the row becomes the suggested type with what the
   * text says (run, sticker shape / size, postcard size, paper weight); the
   * file stays. Mug / notebook / pen open the item picker instead.
   */
  function applyTypeHint(slotId: string, target: TypeHintTarget): void {
    const row = assignBySlot[slotId];
    if (!row || row.productType !== "paper_print") return;
    const input = typeHintInputForSlot(slots.find((x) => x.id === slotId), customer.notes);
    const p = parseHintPrefill(target, input);
    const text = [input.notes ?? "", ...(input.fileNames ?? [])].filter(Boolean).join(" ");
    // Keep a run the manager already typed; only a blank / default 1 is replaced.
    const copies: Partial<SlotAssign> =
      p.quantity != null && (row.copiesStr.trim() === "" || row.copiesStr.trim() === "1")
        ? { copiesStr: String(p.quantity) }
        : {};
    if (target === "set") {
      setGiftSetDialog({ slotId, initial: null });
      return;
    }
    const category = TYPE_HINT_STOCK_CATEGORY[target];
    if (category) {
      setStockPicker({ slotId, category });
      return;
    }
    switch (target) {
      case "uv_dtf":
        pickSlotClientService(slotId, UV_DTF_STICKERS_SERVICE);
        return;
      case "uv_print":
        pickSlotClientService(slotId, "uv_print");
        return;
      case "dtf_apparel":
        updateSlot(slotId, { productType: "dtf_apparel" });
        return;
      case "large_format_print":
        updateSlot(slotId, {
          productType: "large_format_print",
          ...copies,
          ...(p.lfWidthCm != null && p.lfHeightCm != null
            ? { lfPrintWidthCmStr: String(p.lfWidthCm), lfPrintHeightCmStr: String(p.lfHeightCm), lfSizePresetId: null }
            : {}),
        });
        return;
      case "sticker_sheet": {
        const sticker: StickerDraft = { ...defaultStickerDraft() };
        if (p.stickerShape) sticker.shape = p.stickerShape;
        if (p.stickerWidthMm != null) sticker.widthStr = String(p.stickerWidthMm);
        if (p.stickerHeightMm != null) sticker.heightStr = String(p.stickerHeightMm);
        updateSlot(slotId, { productType: "sticker_sheet", ...copies, sticker });
        return;
      }
      case "postcard": {
        const postcard: PostcardDraft = {
          ...defaultPostcardDraft(),
          ...(p.postcardPurpose ? { purpose: p.postcardPurpose } : {}),
          ...(p.creaseLines ? { creaseLines: p.creaseLines } : {}),
        };
        const presetFromPurpose = p.postcardPurpose ? POSTCARD_PURPOSE_DEFAULT_PRESET[p.postcardPurpose] : null;
        const size: Partial<SlotAssign> =
          p.trimWidthCm != null && p.trimHeightCm != null
            ? { bcPresetId: "custom", bcTrimWidthStr: String(p.trimWidthCm), bcTrimHeightStr: String(p.trimHeightCm) }
            : p.postcardPresetId
              ? { bcPresetId: p.postcardPresetId as SheetProductPresetId }
              : presetFromPurpose
                ? { bcPresetId: presetFromPurpose }
                : {};
        const paperId = sheetPaperForHint(bcPaperItems, p.gsm, text);
        updateSlot(slotId, {
          productType: "postcard",
          ...copies,
          postcard,
          ...size,
          ...(p.twoSided ? { bcSides: "two" } : {}),
          ...(paperId ? { bcSheetPaperId: paperId } : {}),
        });
        return;
      }
      case "business_card":
      case "flyer": {
        const paperId = sheetPaperForHint(bcPaperItems, p.gsm, text);
        updateSlot(slotId, {
          productType: target,
          ...copies,
          ...(p.twoSided ? { bcSides: "two" } : {}),
          ...(paperId ? { bcSheetPaperId: paperId } : {}),
        });
        return;
      }
      default:
        return;
    }
  }

  /** Row in menu terms: which stock item (and print method) or client service it is. */
  function slotMenuState(a: SlotAssign): RowMenuState {
    return rowMenuState(
      {
        productType: a.productType,
        uv: a.uv,
        sublimation: a.sublimation,
        dtf: a.dtf,
        designerVariantId: designerRowVariantId(a),
      },
      stockEntries,
    );
  }

  function slotMenuCurrent(state: RowMenuState): ProductMenuCurrent | null {
    if (state.kind === "stock") {
      return {
        title: localizedDtfName(state.entry.categoryNames, locale),
        subtitle: methodTitle(state.method),
        imageUrl: state.entry.imageUrl,
      };
    }
    if (state.kind === "client") {
      const service = clientServiceTiles.find((c) => (c.id ?? c.type) === (state.service ?? state.method));
      return { title: service?.title ?? methodTitle(state.method), subtitle: t.productPicker.clientGroup };
    }
    return null;
  }


  /** Template zone (print place) of a ready-set row. */
  function readySetZone(gs: GiftSetRowAssign): GiftSetZone | null {
    if (!gs.zoneId) return null;
    return giftSetTemplates.find((x) => x.id === gs.templateId)?.zones.find((z) => z.id === gs.zoneId) ?? null;
  }

  /**
   * Exact-size check of a ready-set row saved as a notebook / pen line (the
   * same rule as our notebooks and pens): the result, null while measuring,
   * undefined for the UV places (they get the UV proportions check).
   */
  function readySetLayoutCheck(slotId: string, a: SlotAssign): SizeValidationResult | null | undefined {
    const zone = a.giftSet?.role === "ready" ? readySetZone(a.giftSet) : null;
    const type = zone ? readyZoneLineType(zone.id) : null;
    if (type === "notebook") return nbUploadOk[slotId] ?? null;
    if (type === "pen") return penUploadOk[slotId] ?? null;
    return undefined;
  }

  /** Print size a set row's file is shown against: the UV places of a ready set (proportions check, like UV). */
  function giftSetDeclaredSize(a: SlotAssign): PrintSizeCm | null {
    const zone = a.giftSet?.role === "ready" ? readySetZone(a.giftSet) : null;
    if (!zone || readyZoneLineType(zone.id) !== "uv_print") return null;
    return { widthCm: zone.widthCm, heightCm: zone.heightCm };
  }

  /**
   * Product / item / price / quantity cells of a «Набор» row: the set badge
   * (every row of the set), the item with its photo and colour, the row's
   * share of the set price, N sets (changed in the set dialog only). The
   * set's actions sit in its header row ({@link renderGiftSetHeaderRow}).
   */
  function renderGiftSetCells(s: AdminWizardSlot, a: SlotAssign, layoutCheck: SizeValidationResult | null | undefined) {
    const gs = a.giftSet!;
    const g = t.giftSet;
    const template = giftSetTemplates.find((x) => x.id === gs.templateId) ?? null;
    const comp = template?.components.find((c) => c.role === gs.role);
    const zone = gs.zoneId ? template?.zones.find((z) => z.id === gs.zoneId) : undefined;
    const label = zone?.label ?? comp?.label ?? (gs.role === "ready" ? "" : g.roleNames[gs.role]);
    const item = giftSetRowItem(a);
    const readyType = zone ? readyZoneLineType(zone.id) : null;
    const Icon =
      gs.role === "ready"
        ? readyType === "notebook" || readyType === "pen"
          ? PRODUCT_TYPE_ICONS[readyType]
          : PRODUCT_TYPE_ICONS.uv_print
        : PRODUCT_TYPE_ICONS[gs.role];
    const total = slotLineTotalMdl(s.id);
    const ready = gs.role === "ready";
    return (
      <>
        <td className="min-w-0 px-2.5 py-2 align-top" data-testid="gift-set-row">
          <GiftSetBadge label={g.badge(template?.name ?? gs.templateId, gs.quantity)} className="max-w-full whitespace-normal" />
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            {ready ? g.fileFor(label) : label}
          </p>
        </td>
        <td className="min-w-0 px-2.5 py-2 align-top text-xs text-gray-700">
          {item ? (
            <span className="flex min-w-0 items-center gap-2" data-testid="gift-set-row-item">
              {/* A ready set's notebook / pen row: the type icon with the colour dot (the set photo shows the whole set). */}
              <GiftSetItemThumb
                imageUrl={ready && (readyType === "notebook" || readyType === "pen") ? null : item.imageUrl}
                swatch={giftSetSwatchHex(item)}
                alt={giftSetItemAlt(item)}
                icon={ready && (readyType === "notebook" || readyType === "pen") ? readyType : undefined}
              />
              <span className="min-w-0">
                <span className="block font-medium text-gray-900">
                  {ready
                    ? zone
                      ? readySetUvDescription(zone, item.variantLabel ?? null)
                      : (item.variantLabel ?? item.itemNames.ru)
                    : `${item.itemNames.ru}${item.variantLabel ? ` · ${item.variantLabel}` : ""}`}
                </span>
                {/* A ready set's print row is the component, not the set item: its SKU belongs to the set's stock row. */}
                {ready ? null : <span className="block text-gray-400">{item.sku}</span>}
              </span>
            </span>
          ) : (
            <span className="text-amber-700">{ready ? g.readyItemMissing : g.noVariants}</span>
          )}
          {zone ? <p className="mt-0.5 text-gray-500">{g.zoneSize(String(zone.widthCm).replace(".", ","), String(zone.heightCm).replace(".", ","))}</p> : null}
          {layoutCheck?.unreadable ? (
            <p className="mt-0.5 text-amber-700">{t.admin.newOrderPage.layoutCheckUnreadable}</p>
          ) : null}
          {layoutCheck && !layoutCheck.ok ? (
            <p className="mt-0.5 text-red-600">
              {t.admin.newOrderPage.blockLayoutSize(
                layoutCheck.expected.width,
                layoutCheck.expected.height,
                layoutCheck.actual.width,
                layoutCheck.actual.height,
              )}
            </p>
          ) : null}
        </td>
        <td className="min-w-0 px-1 py-2 align-top text-center tabular-nums">
          <span className="py-1 text-[13px] font-medium text-gray-900" data-testid="gift-set-row-total">
            {total > 0 ? formatAmountMdl(total, t.admin.currency) : "—"}
          </span>
          {gs.quantity > 0 && total > 0 ? (
            <p className="text-[10px] leading-tight text-gray-500">{g.lineShare(String(Math.round((total / gs.quantity) * 100) / 100))}</p>
          ) : null}
        </td>
        <td className="max-w-[4.75rem] px-1 py-2 align-top text-center">
          <input
            readOnly
            aria-label={g.quantity}
            className="mx-auto block w-full min-w-[3.75rem] max-w-[4.5rem] rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-center text-sm tabular-nums text-gray-500"
            value={String(gs.quantity)}
          />
        </td>
      </>
    );
  }

  /** Set badge + item label over an assembled set row's product picker. */
  function renderGiftSetRowBadge(gs: GiftSetRowAssign) {
    const g = t.giftSet;
    const template = giftSetTemplates.find((x) => x.id === gs.templateId) ?? null;
    return (
      <div className="mb-1" data-testid="gift-set-row">
        <GiftSetBadge label={g.badge(template?.name ?? gs.templateId, gs.quantity)} className="max-w-full whitespace-normal" />
      </div>
    );
  }

  /** Price + quantity cells of an assembled set row: its share of the set price, N sets (changed in «Изменить набор»). */
  function renderGiftSetPriceQtyCells(s: AdminWizardSlot, gs: GiftSetRowAssign) {
    const g = t.giftSet;
    const total = slotLineTotalMdl(s.id);
    return (
      <>
        <td className="min-w-0 px-1 py-2 align-top text-center tabular-nums">
          <span className="py-1 text-[13px] font-medium text-gray-900" data-testid="gift-set-row-total">
            {total > 0 ? formatAmountMdl(total, t.admin.currency) : "—"}
          </span>
          {gs.quantity > 0 && total > 0 ? (
            <p className="text-[10px] leading-tight text-gray-500">{g.lineShare(String(Math.round((total / gs.quantity) * 100) / 100))}</p>
          ) : null}
        </td>
        <td className="max-w-[4.75rem] px-1 py-2 align-top text-center">
          <input
            readOnly
            aria-label={g.quantity}
            title={g.quantityInSetDialog}
            className="mx-auto block w-full min-w-[3.75rem] max-w-[4.5rem] rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-center text-sm tabular-nums text-gray-500"
            value={String(gs.quantity)}
          />
        </td>
      </>
    );
  }

  /** Stock item (variant) of a «Набор» row: the component, or the ready set's colour. */
  function giftSetRowItem(a: SlotAssign): UvStockItemJson | null {
    const gs = a.giftSet;
    if (!gs) return null;
    const variantId = gs.role === "ready" ? (gs.readyVariantId ?? null) : designerRowVariantId(a);
    if (!variantId) return null;
    return uvCatalog.items.find((i) => i.id === variantId) ?? sublimationCatalog.items.find((i) => i.id === variantId) ?? null;
  }

  /** Header row of a «Набор» in the wizard table: the set, its price, «Изменить набор» / «Убрать набор» (once per set). */
  function renderGiftSetHeaderRow(s: AdminWizardSlot, gs: GiftSetRowAssign) {
    const g = t.giftSet;
    const template = giftSetTemplates.find((x) => x.id === gs.templateId) ?? null;
    const total = giftSetGroupSlotIds(s.id, giftSetRows()).reduce((sum, id) => sum + (giftSetTotals.get(id) ?? 0), 0);
    return (
      <tr className="border-b border-fuchsia-100 bg-fuchsia-50/70" data-testid="gift-set-group-header">
        <td colSpan={6} className="border-l-4 border-l-fuchsia-400 py-1.5 pl-3 pr-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <GiftSetBadge label={g.badge(template?.name ?? gs.templateId, gs.quantity)} className="text-xs" />
            {total > 0 ? (
              <span className="tabular-nums text-fuchsia-900">
                {gs.quantity > 1 ? `${formatAmountMdl(Math.round((total / gs.quantity) * 100) / 100, t.admin.currency)} × ${gs.quantity} = ` : ""}
                <b>{formatAmountMdl(total, t.admin.currency)}</b>
              </span>
            ) : null}
            {!template?.boxSku && template?.kind === "assembled" ? <span className="text-gray-500">{g.noBox}</span> : null}
            <span className="ml-auto flex flex-wrap gap-x-3">
              <button
                type="button"
                data-testid="gift-set-change"
                className="font-medium text-amber-700 hover:underline"
                onClick={() => setGiftSetDialog({ slotId: s.id, initial: giftSetChoiceForSlot(s.id) })}
              >
                {g.change}
              </button>
              <button type="button" data-testid="gift-set-remove" className="text-gray-500 hover:text-red-600" onClick={() => removeGiftSet(s.id)}>
                {g.remove}
              </button>
            </span>
          </div>
        </td>
      </tr>
    );
  }

  /**
   * The stock row of a set: the box of an assembled set / the set item of a
   * ready set (its colour variant). No file, «входит в набор», N units off the stock.
   */
  function renderGiftSetBoxRow(box: GiftSetBoxRow) {
    const g = t.giftSet;
    const ready = box.kind === "ready";
    const variantItem = ready && box.variantId ? uvCatalog.items.find((i) => i.id === box.variantId) : undefined;
    const onHand = ready ? variantItem?.stockQuantity : bootstrap.giftSetBoxStock?.[box.boxSku];
    // Edit: what the saved set already holds of this unit comes back before it is taken again.
    const saved = savedSetUnitRef.current.get(box.groupId);
    const savedSame = Boolean(saved && ((saved.sku && saved.sku === box.boxSku) || (saved.variantId && saved.variantId === box.variantId)));
    // The ledger's held units when known (a set saved short holds 0), else the saved quantity.
    const ledgerHeld = savedSetHeldRef.current ? (savedSetHeldRef.current.get(box.groupId) ?? new Map<string, number>()) : null;
    const heldBack = ledgerHeld
      ? Math.min(saved?.quantity ?? 0, ready ? (box.variantId ? (ledgerHeld.get(box.variantId) ?? 0) : 0) : (ledgerHeld.get(`box:${box.boxSku}`) ?? 0))
      : saved?.quantity ?? 0;
    const stock = onHand === undefined ? undefined : onHand + (savedSame ? heldBack : 0);
    // Item column: the stock item's own name («Коробка 30×23×8,5 см (набор с кружкой)» / «Набор: ручка + блокнот + термос · чёрный»).
    const fullName = ready
      ? variantItem
        ? `${variantItem.itemNames.ru ?? variantItem.name}${variantItem.variantLabel ? ` · ${variantItem.variantLabel}` : ""}`
        : box.name
      : (bootstrap.giftSetBoxNames?.[box.boxSku] ?? box.name);
    const photo = ready ? (variantItem?.imageUrl ?? null) : (bootstrap.giftSetBoxImages?.[box.boxSku] ?? null);
    const setGs = slots.map((x) => assignBySlot[x.id]?.giftSet).find((x) => x?.groupId === box.groupId) ?? null;
    const setTemplate = setGs ? giftSetTemplates.find((x) => x.id === setGs.templateId) : undefined;
    const BoxIcon = ready ? PRODUCT_TYPE_ICONS.gift_set : PRODUCT_TYPE_ICONS.set_box;
    return (
      <tr className="border-b border-gray-100 bg-fuchsia-50/30" data-testid="gift-set-box-row">
        <td className="min-w-0 border-l-4 border-l-fuchsia-300 py-2 pl-3 pr-2 align-top text-xs text-gray-500">
          <span className="ml-7 inline-flex items-center gap-1.5">{ready ? g.readyUnitNoFile : g.boxNoFile}</span>
        </td>
        <td className="min-w-0 px-2.5 py-2 align-top">
          <GiftSetBadge label={g.badge(setTemplate?.name ?? "", box.quantity)} className="max-w-full whitespace-normal" />
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <BoxIcon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            {box.name}
          </p>
        </td>
        <td className="min-w-0 px-2.5 py-2 align-top text-xs text-gray-700">
          <span className="flex min-w-0 items-center gap-2">
            <GiftSetItemThumb
              imageUrl={photo}
              swatch={variantItem ? giftSetSwatchHex(variantItem) : null}
              alt={fullName}
              icon={ready ? "gift" : "box"}
            />
            <span className="min-w-0">
              <span className="block font-medium text-gray-900">{fullName}</span>
              <span className="block text-gray-400">{box.boxSku}</span>
            </span>
          </span>
          <p className="mt-0.5 text-gray-500">
            {g.boxStockNote}
            {stock !== undefined ? (
              <span className={cn("ml-1", stock < box.quantity ? "text-red-600" : "text-gray-400")}>
                · {stock > 0 ? g.stockLeft(stock) : g.variantOutOfStock}
                {stock < box.quantity ? ` · ${g.boardProcurement}` : ""}
              </span>
            ) : null}
          </p>
        </td>
        <td className="min-w-0 px-1 py-2 align-top text-center text-[11px] leading-tight text-fuchsia-800" data-testid="gift-set-box-price">
          {g.boxIncluded}
        </td>
        <td className="max-w-[4.75rem] px-1 py-2 align-top text-center">
          <input
            readOnly
            aria-label={g.quantity}
            className="mx-auto block w-full min-w-[3.75rem] max-w-[4.5rem] rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-center text-sm tabular-nums text-gray-500"
            value={String(box.quantity)}
          />
        </td>
        <td aria-hidden />
      </tr>
    );
  }

  /** Rows with their set, for the «Набор» helpers. */
  function giftSetRows(): { slotId: string; giftSet: GiftSetRowAssign | null | undefined }[] {
    return slots.map((x) => ({ slotId: x.id, giftSet: assignBySlot[x.id]?.giftSet }));
  }

  /**
   * Removes a row. An item row of an assembled «Набор» leaves the set after a
   * confirm: the set dissolves, the other rows go at their normal price, the
   * box goes. A ready set's row removes the whole set (after a confirm): it
   * is one bought-in item.
   */
  function removeSlot(slotId: string): void {
    const ids: string[] = giftSetGroupSlotIds(slotId, giftSetRows());
    const gs = assignBySlot[slotId]?.giftSet;
    if (ids.length > 1 && gs && gs.role !== "ready") {
      setGiftSetLeave({ slotId, role: gs.role, run: null });
      return;
    }
    if (ids.length > 1) {
      removeGiftSet(slotId);
      return;
    }
    removeSlotIds(ids);
  }

  /** «Убрать набор»: every row of the set goes (after a confirm). */
  function removeGiftSet(slotId: string): void {
    const ids: string[] = giftSetGroupSlotIds(slotId, giftSetRows());
    const gs = assignBySlot[slotId]?.giftSet;
    const template = gs ? giftSetTemplates.find((x) => x.id === gs.templateId) : null;
    setGiftSetRemove({ ids, name: template?.name ?? gs?.templateId ?? "" });
  }

  /**
   * A change of a row: runs at once, unless it takes an assembled set's item
   * row out of its set (another product type, the client's own item) — then
   * the manager confirms first and the set dissolves. `next` = what the row
   * becomes (null: another type for sure). Another SKU of the same type keeps the set.
   */
  function guardSetRowChange(
    slotId: string,
    next: { productType: string | null; stockItem: boolean } | null,
    run: () => void,
  ): void {
    const gs = assignBySlot[slotId]?.giftSet;
    if (!gs || gs.role === "ready" || (next?.productType && giftSetRowKeepsSet(gs, { productType: next.productType, stockItem: next.stockItem }))) {
      run();
      return;
    }
    setGiftSetLeave({ slotId, role: gs.role, run });
  }

  /** Designer product (mug / notebook / pen) a stock menu entry becomes, else null. */
  function stockEntryDesigner(entryId: string): string | null {
    const entry: StockMenuEntry | undefined = stockEntries.find((e) => e.id === entryId);
    if (!entry) return null;
    for (const m of entry.methods) {
      if (m === "dtf_apparel") continue;
      const d = designerProductForVariant(designerCatalogs, m, entry.id);
      if (d) return d;
    }
    return entry.methods[0] ?? null;
  }

  /**
   * The set of this row dissolves: its rows become ordinary rows at their
   * normal price, the box row goes (not written off). `remove`: the row itself goes too.
   */
  function dissolveGiftSet(slotId: string, remove: boolean): void {
    const groupId = assignBySlot[slotId]?.giftSet?.groupId;
    if (!groupId) return;
    setAssignBySlot((prev) => dissolveGiftSetAssigns(prev, groupId));
    if (remove) removeSlotIds([slotId]);
  }

  /** Drops these rows (a single row, or every row of a set). */
  function removeSlotIds(ids: string[]): void {
    if (stockPicker && ids.includes(stockPicker.slotId)) {
      setStockPicker(null);
    }
    setSlots((prev) => prev.filter((x) => !ids.includes(x.id)));
    setSelectedSlots((prev) => {
      const n = new Set(prev);
      for (const id of ids) n.delete(id);
      return n;
    });
  }

  /** The set dialog's choice for the set a row belongs to (to edit it). */
  function giftSetChoiceForSlot(slotId: string): GiftSetChoice | null {
    const gs = assignBySlot[slotId]?.giftSet;
    if (!gs) return null;
    const variants: GiftSetChoice["variants"] = {};
    for (const id of giftSetGroupSlotIds(slotId, giftSetRows())) {
      const row = assignBySlot[id];
      const v = row ? designerRowVariantId(row) : null;
      if (row?.giftSet && row.giftSet.role !== "ready" && v) variants[row.giftSet.role] = v;
    }
    return {
      templateId: gs.templateId,
      quantity: gs.quantity,
      variants,
      readyVariantId: gs.readyVariantId ?? null,
      manualUnitPriceMdl: gs.manualUnitPriceMdl,
    };
  }

  /**
   * «Набор» applied to a row: the row (and its set's rows, when editing a set)
   * become the set's rows — assembled: a mug / notebook / pen row per item,
   * ready: one row per print place (one UV line on save). Files stay on the
   * rows of the same item / place; new rows are added under the first one.
   */
  function applyGiftSet(slotId: string, template: GiftSetTemplate, choice: GiftSetChoice): void {
    const rows = giftSetRows();
    const oldIds: string[] = giftSetGroupSlotIds(slotId, rows);
    const groupId: string = assignBySlot[slotId]?.giftSet?.groupId ?? newSlotId();
    const plans = giftSetRowPlans(template, choice);
    const free: string[] = [...oldIds];
    const take = (match: (a: SlotAssign | undefined) => boolean): string | null => {
      const k = free.findIndex((id) => match(assignBySlot[id]));
      if (k === -1) return null;
      return free.splice(k, 1)[0]!;
    };
    const planned: { id: string; plan: (typeof plans)[number] }[] = plans.map((plan) => {
      const id =
        take((a) => Boolean(a?.giftSet && (plan.zoneId ? a.giftSet.zoneId === plan.zoneId : a.giftSet.role === plan.role))) ??
        // The row the set was picked on (not yet in a set) takes the first item.
        take((a) => !a?.giftSet) ??
        newSlotId();
      return { id, plan };
    });
    // Rows of the old set nothing maps to: dropped when empty, else kept as plain rows.
    const leftovers = free;
    const firstOld = slots.findIndex((x) => oldIds.includes(x.id));
    // A new set goes after the lines already there (sets read A, B, C in the order added); an edited set stays put.
    const isNewSet = !assignBySlot[slotId]?.giftSet;
    // Edit: the price the saved set was sold at stays (unless the template / customer type changes).
    const savedPrice = assignBySlot[slotId]?.giftSet?.savedPrice ?? null;
    setSlots((prev) => {
      const byId = new Map(prev.map((x) => [x.id, x]));
      const groupRows: AdminWizardSlot[] = planned.map(({ id }) => byId.get(id) ?? { id, sourceOrderLineId: null });
      const keptLeftovers = leftovers.map((id) => byId.get(id)!).filter((x) => x && slotHasArtwork(x));
      return placeGiftSetRows(prev, oldIds, groupRows, keptLeftovers, { firstOld, isNewSet });
    });
    setAssignBySlot((prev) => {
      const next = { ...prev };
      for (const { id, plan } of planned) {
        const base: SlotAssign =
          prev[id] ??
          defaultAssign(
            mugProductItems,
            notebookProductItems,
            penProductItems,
            lfMaterialItems[0]?.id ?? null,
            customer.customerType,
            bcDefaultSheetPaperId,
          );
        const gs: GiftSetRowAssign = {
          groupId,
          templateId: template.id,
          role: plan.role,
          quantity: choice.quantity,
          manualUnitPriceMdl: choice.manualUnitPriceMdl,
          ...(savedPrice ? { savedPrice } : {}),
          ...(plan.zoneId ? { zoneId: plan.zoneId, readyVariantId: plan.variantId } : {}),
        };
        if (plan.productType === "uv_print") {
          next[id] = {
            ...base,
            productType: "uv_print",
            uv: null,
            sublimation: null,
            dtf: null,
            paperPrint: null,
            copiesStr: String(choice.quantity),
            linePriceStr: "",
            giftSet: gs,
          };
        } else {
          const converted = pickPrintMethodItem(
            { ...base, giftSet: null, productType: base.giftSet?.role === "ready" ? "paper_print" : base.productType },
            plan.method,
            { source: "stock", variantId: plan.variantId },
            designerCatalogs,
          );
          next[id] = { ...converted, copiesStr: String(choice.quantity), linePriceStr: "", giftSet: gs };
        }
      }
      for (const id of leftovers) {
        const cur = next[id];
        if (!cur) continue;
        next[id] = cur.giftSet?.role === "ready"
          ? { ...cur, giftSet: null, productType: "paper_print", paperPrint: defaultPaperPrint() }
          : { ...cur, giftSet: null };
      }
      return next;
    });
  }

  function addWizardRow(): void {
    setSlots((prev) => {
      if (prev.length >= MAX_WIZARD_SLOTS) return prev;
      return [{ id: newSlotId(), sourceOrderLineId: null }, ...prev];
    });
  }

  /**
   * Why «Далее» is disabled: one short reason per blocked row («№2 · file: …»),
   * shown next to the button. Empty when the step can advance.
   */
  function advanceBlockers(): string[] {
    if (step !== "files") return [];
    const np = t.admin.newOrderPage;
    const out: string[] = [];
    if (slots.length < 1) return [np.blockNoRows];
    if (slots.length > MAX_WIZARD_SLOTS) return [np.blockNoRows];
    slots.forEach((s, index) => {
      const reason = slotAdvanceBlocker(s);
      if (reason) {
        const name = slotArtworkName(s) ?? s.missingFileName ?? np.fileNotChosenPlaceholder;
        out.push(np.advanceBlockerRow(index + 1, name, reason));
      }
    });
    if (!dealerMode && customer.phone.length < 8) out.push(np.blockPhone);
    return out;
  }

  /** First reason one row blocks «Далее», or null. */
  function slotAdvanceBlocker(s: AdminWizardSlot): string | null {
    const np = t.admin.newOrderPage;
    if (!slotHasArtwork(s)) return np.blockNoFile;
    const a = assignBySlot[s.id];
    if (!a) return np.blockNoProduct;
    if (s.linkUrl && linkNotAllowedFor(a.productType)) return np.blockLinkNotAllowed;
    const cop = parseAdminCopiesInput(a.copiesStr);
    if (cop === null) return np.blockCopies;
    // A ready gift set row: the set item colour and a file are all it needs (the size is checked under the file).
    if (a.giftSet?.role === "ready") {
      if (!a.giftSet.readyVariantId) return t.giftSet.pickProblem.ready_item_missing;
      const check = readySetLayoutCheck(s.id, a);
      if (check === undefined || s.linkUrl) return null;
      if (check === null) return np.blockLayoutChecking;
      return check.ok ? null : np.blockLayoutSize(check.expected.width, check.expected.height, check.actual.width, check.actual.height);
    }
    if (a.productType === "paper_print") {
      if (!a.paperPrint) return np.blockPaperOptions;
      if (
        a.paperPrint.paperType === "other" &&
        (!a.paperPrint.customWidth.trim() ||
          !a.paperPrint.customHeight.trim())
      ) {
        return np.blockPaperOptions;
      }
    }
    for (const [kind, pick, uploadOk] of [
      ["mug", a.mugPick, mugUploadOk],
      ["notebook", a.nbPick, nbUploadOk],
      ["pen", a.penPick, penUploadOk],
    ] as const) {
      if (a.productType !== kind) continue;
      if (!pick) return np.blockPickItem;
      if (pick.type === "catalog" && !pick.productId) return np.blockPickItem;
      const v = uploadOk[s.id];
      if (pick.type === "catalog" && !s.linkUrl) {
        if (v === null || v === undefined) return np.blockLayoutChecking;
        if (!v.ok) {
          return np.blockLayoutSize(v.expected.width, v.expected.height, v.actual.width, v.actual.height);
        }
      }
    }
    if (a.productType === "large_format_print") {
      if (!a.lfMaterialId && !a.lfSelectionValue) return np.blockLfMaterial;
      const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
      const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0)
        return np.blockLfSize;
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
      if (!mat) return np.blockLfDoesNotFit;
      const printableCm =
        resolveEffectivePrintableWidthMeters({
          printableWidthMeters: mat.printableWidthMeters,
          rollWidthMeters: mat.rollWidthMeters,
        }) * 100;
      if (!lfPieceFitsAcrossPrintableWidthCm(w, h, printableCm)) return np.blockLfDoesNotFit;
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
      if (!lfCheck.ok) return np.blockLfPrice;
    }
    if (isSheetProductType(a.productType)) {
      if (!a.bcSheetPaperId) return np.blockBcPaper;
      // A double-sided run needs the reverse artwork; the front comes from
      // the row's own file like every other product. In edit mode the
      // reverse may already be on the order instead of freshly picked.
      if (a.bcSides === "two" && !a.bcBackFile && !a.bcBackExistingFile && !a.bcBackReuse) {
        return np.blockBcBack;
      }
      // Artwork made without bleed loses its edges in the cut.
      const faces = bcArtworkKeys(s, a);
      const { generatesMissingBleed } = sheetProductConfig(a.productType);
      if (
        bcArtworkBlocks(
          bcArtworkVerdict(faces.front, a, bcArtworkSizes),
          generatesMissingBleed,
        ) ||
        bcArtworkBlocks(
          bcArtworkVerdict(faces.back, a, bcArtworkSizes),
          generatesMissingBleed,
        )
      ) {
        return np.blockBcBleed;
      }
      if (
        !bcSlotPricing(a, bcPaperById, bcMinimumLineTotalMdlEffective) &&
        !parsedLinePriceMdl(a.linePriceStr)
      ) {
        return np.blockBcRun;
      }
    }
    if (a.productType === "dtf_apparel") {
      const quote = dtfSlotQuote(a, dtfCatalog);
      if (!quote?.ok) {
        return !quote || quote.code === "dtf_incomplete" ? np.blockIncomplete : t.dtf.errors[quote.code];
      }
    }
    if (a.productType === "uv_print") {
      const quote = uvSlotQuote(a, uvCatalog);
      // Dealers: no rate yet → the line goes in unpriced (the studio prices it).
      const unpricedOk = dealerMode && !quote?.ok && quote?.code === "uv_price_not_set";
      if (!quote?.ok && !unpricedOk) {
        return !quote || quote.code === "uv_incomplete" ? np.blockIncomplete : t.uv.errors[quote.code];
      }
      if (a.uv?.source === "client" && !a.uv.description.trim()) return np.blockClientItemDescription;
      // Dealers: the workshop must see the item and its real size (optional for staff).
      if (dealerMode && !a.giftSet && a.uv?.source === "client") {
        if (!uvDraftItemSize(a.uv)) return t.uv.editor.blockItemSize;
        if (!a.uv.photo) return t.uv.editor.blockItemPhoto;
      }
    }
    if (a.productType === "sublimation_print") {
      const quote = sublimationSlotQuote(a, sublimationCatalog);
      const unpricedOk = dealerMode && !quote?.ok && quote?.code === "subl_price_not_set";
      if (!quote?.ok && !unpricedOk) {
        return !quote || quote.code === "subl_incomplete" ? np.blockIncomplete : t.sublimation.errors[quote.code];
      }
      if (a.sublimation?.source === "client" && !a.sublimation.description.trim()) {
        return np.blockClientItemDescription;
      }
    }
    return null;
  }

  function canAdvance(): boolean {
    return advanceBlockers().length === 0;
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
        // «Набор» C: the set's notebook / pen take the exact size of their print place, like ours.
        const readyZone = a?.giftSet?.role === "ready" ? readySetZone(a.giftSet) : null;
        const readyType = readyZone ? readyZoneLineType(readyZone.id) : null;
        for (const kind of CATALOG_SKU_KINDS) {
          const expected =
            readyZone
              ? readyType === kind && !s.linkUrl
                ? readyZoneExpectedPx(readyZone)
                : null
              : a && a.productType === kind
                ? expectedLayoutPx(a, kind, mugById, nbById, penById)
                : null;
          results[kind][s.id] = expected
            ? await measureSlotLayout(s, expected, dealerMode)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readySetZone only reads giftSetTemplates
  }, [step, slots, assignBySlot, mugById, nbById, penById, giftSetTemplates, dealerMode]);

  useEffect(() => {
    if (step === "confirm") return;
    const pending: BcArtworkKey[] = [];
    for (const s of slots) {
      const a = assignBySlot[s.id];
      if (!isSheetProductType(a?.productType)) continue;
      const { front, back } = bcArtworkKeys(s, a);
      for (const key of [front, back]) {
        if (
          key !== null &&
          !bcArtworkSizes.has(key) &&
          !bcArtworkMeasuringRef.current.has(key)
        ) {
          pending.push(key);
        }
      }
    }
    if (pending.length === 0) return;
    // Not cancelled on re-render: results are keyed by file, so a late answer
    // is still right, and typing in the row must not restart a download.
    for (const key of pending) bcArtworkMeasuringRef.current.add(key);
    void Promise.all(
      pending.map(
        async (key) =>
          [
            key,
            typeof key === "string"
              ? await readStoredBusinessCardArtworkSizeCm(key, dealerMode)
              : await readBusinessCardArtworkSizeCm(key),
          ] as const,
      ),
    ).then((measured) => {
      for (const [key] of measured) bcArtworkMeasuringRef.current.delete(key);
      setBcArtworkSizes((prev) => {
        const next = new Map(prev);
        for (const [key, size] of measured) next.set(key, size);
        return next;
      });
    });
  }, [step, slots, assignBySlot, bcArtworkSizes, dealerMode]);

  /**
   * Size prefill from the picked file's physical size (the «100×50 см · 60 dpi»
   * under the file): once per row and product, a large-format row still on the
   * default 100×100 and a UV-DTF stickers row with an empty sticker size take
   * the file's size. Values the user has typed are never overwritten.
   */
  const sizePrefillDoneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (step !== "files") return;
    for (const s of slots) {
      const a = assignBySlot[s.id];
      const file: File | undefined = s.file;
      if (!a || !file) continue;
      const kind: "lf" | "stickers" | null =
        a.productType === "large_format_print"
          ? "lf"
          : a.productType === "uv_print" && a.uv?.source === "stickers"
            ? "stickers"
            : null;
      if (!kind) continue;
      const key = `${s.id}|${kind}`;
      if (sizePrefillDoneRef.current.has(key)) continue;
      const isDefault =
        kind === "lf"
          ? !a.lfSizePresetId &&
            a.lfPrintWidthCmStr === EMPTY_ASSIGN_LF_WIDTH &&
            a.lfPrintHeightCmStr === EMPTY_ASSIGN_LF_HEIGHT
          : a.uv?.zones.length === 1 && !a.uv.zones[0]!.widthStr.trim() && !a.uv.zones[0]!.heightStr.trim();
      sizePrefillDoneRef.current.add(key);
      if (!isDefault) continue;
      const slotId: string = s.id;
      void readLocalFileMetaCached(file).then((meta) => {
        if (meta.metaStatus !== "ok" || !meta.widthMm || !meta.heightMm) return;
        const w: string = String(Math.round(meta.widthMm) / 10);
        const h: string = String(Math.round(meta.heightMm) / 10);
        setAssignBySlot((prev) => {
          const cur = prev[slotId];
          if (!cur) return prev;
          if (kind === "lf") {
            if (
              cur.productType !== "large_format_print" ||
              cur.lfSizePresetId ||
              cur.lfPrintWidthCmStr !== EMPTY_ASSIGN_LF_WIDTH ||
              cur.lfPrintHeightCmStr !== EMPTY_ASSIGN_LF_HEIGHT
            ) {
              return prev;
            }
            return { ...prev, [slotId]: { ...cur, lfPrintWidthCmStr: w, lfPrintHeightCmStr: h } };
          }
          const zone = cur.uv?.zones[0];
          if (
            cur.productType !== "uv_print" ||
            cur.uv?.source !== "stickers" ||
            cur.uv.zones.length !== 1 ||
            !zone ||
            zone.widthStr.trim() ||
            zone.heightStr.trim()
          ) {
            return prev;
          }
          return {
            ...prev,
            [slotId]: { ...cur, uv: { ...cur.uv, zones: [{ ...zone, widthStr: w, heightStr: h }] } },
          };
        });
      });
    }
  }, [step, slots, assignBySlot]);

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

  // Dealer mode: price the order on the server when the confirm step opens,
  // before any file is uploaded (files travel as placeholders).
  useEffect(() => {
    if (!dealerMode || step !== "confirm") return;
    let cancelled = false;
    setDealerQuote({ status: "loading" });
    (async () => {
      try {
        const placeholder = async (file: File): Promise<UploadResult> => ({
          fileName: file.name,
          fileUrl: "pending-upload",
        });
        const res = editOrderId
          ? await putDealerOrderEdit(
              editOrderId,
              await buildAdminOrderUpdateLines(
                slots,
                applyMinimalLayoutJsonWhenNewUpload(slots, assignBySlot),
                bcPaperById,
                undefined,
                placeholder,
                giftSetTemplates,
                storedLineTypesRef.current,
                setBoxLineIdsRef.current,
              ),
              "",
              true,
            )
          : await postDealerOrder(await buildCreateLines(placeholder), "", true);
        if (cancelled) return;
        const urgency: DealerUrgencyQuote = res.urgency ?? { available: false, state: "off" };
        if (!dealerUrgentInitRef.current) {
          dealerUrgentInitRef.current = true;
          setDealerUrgent(urgency.state === "dealer");
        }
        setDealerQuote({
          status: "ok",
          totalMdl: res.totalMdl ?? null,
          goodsTotalMdl: res.goodsTotalMdl !== undefined ? res.goodsTotalMdl : (res.totalMdl ?? null),
          lineTotalsMdl: res.lineTotalsMdl ?? [],
          urgency,
        });
      } catch {
        if (!cancelled) setDealerQuote({ status: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Rows cannot change on the confirm step; re-price only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerMode, step]);

  /**
   * What the dealer's save sends as `urgent`: the checkbox, or nothing when the
   * quote did not load / the studio set it (the server then keeps it as is).
   */
  function dealerUrgentForSubmit(): boolean | undefined {
    if (dealerQuote.status !== "ok") return undefined;
    if (dealerQuote.urgency.state === "staff") return undefined;
    if (!dealerQuote.urgency.available && dealerQuote.urgency.state !== "dealer") return undefined;
    return dealerUrgent;
  }

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

  /**
   * Order lines of a new order, one per row. `upload` stores each file (a
   * placeholder for the dealer price preview); `onSlot` reports progress.
   */
  async function buildCreateLines(
    uploadArtwork: (file: File) => Promise<UploadResult>,
    onSlot?: (slotId: string, status: "uploading" | "done") => void,
  ): Promise<AdminOrderLineInput[]> {
    const lines: AdminOrderLineInput[] = [];
    for (const slot of slots) {
      const a = assignBySlot[slot.id];
      if (!a) throw new Error("Missing row config");
      const localFile: File | undefined = slot.file;
      const linkUrl: string | undefined = slot.linkUrl;
      const reuse: WizardReusedFile | undefined = slot.reuse;
      if (!localFile && !linkUrl && !reuse) throw new Error("Missing file");
      onSlot?.(slot.id, "uploading");
      // A pasted link is stored as is (name = address), like on the home page;
      // a reused library / stored key too — nothing is uploaded or copied.
      const upload = (f: File | undefined): Promise<UploadResult> =>
        f
          ? uploadArtwork(f)
          : Promise.resolve(
              reuse ? { fileName: reuse.fileName, fileUrl: reuse.fileUrl } : { fileName: linkUrl!, fileUrl: linkUrl! },
            );

      // A ready gift set: every row (print place) is its own line — notebook / pen / UV.
      if (a.giftSet?.role === "ready") {
        const gs = a.giftSet;
        const template = giftSetTemplates.find((x) => x.id === gs.templateId);
        const { line, paperType } = readySetRowLine(template, gs, a.lfCustomerType, null);
        const { fileName, fileUrl } = await upload(localFile);
        lines.push({
          ...line,
          files: [{ fileName, fileUrl, copies: gs.quantity, color: "color", ...(paperType ? { paperType } : {}) }],
        });
        onSlot?.(slot.id, "done");
        continue;
      }

      if (a.productType === "paper_print") {
        const paperCopies = parseAdminCopiesInput(a.copiesStr);
        if (paperCopies === null) throw new Error("Invalid copies");
        const pp = a.paperPrint;
        if (!pp) throw new Error("Paper options missing");
        const { fileName, fileUrl } = await upload(localFile);
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
      } else if (isDesignerProductType(a.productType)) {
        // Mug / notebook / pen — also when reached via UV or sublimation.
        const designerCopies = parseAdminCopiesInput(a.copiesStr);
        if (designerCopies === null) throw new Error("Invalid copies");
        const uploaded = await upload(localFile);
        lines.push(designerCreateLine(a, uploaded, designerCopies));
      } else if (a.productType === "large_format_print") {
        const qty = parseAdminCopiesInput(a.copiesStr);
        if (qty === null) throw new Error("Invalid copies");
        const w = parseFloat(a.lfPrintWidthCmStr.replace(",", "."));
        const h = parseFloat(a.lfPrintHeightCmStr.replace(",", "."));
        if (!Number.isFinite(w) || !Number.isFinite(h)) {
          throw new Error("Invalid dimensions");
        }
        if (!a.lfMaterialId && !a.lfSelectionValue) throw new Error("Material required");
        const { fileName, fileUrl } = await upload(localFile);
        
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
          ...(hasLfLineExtras(a.lfExtras) ? { lfFinishing: a.lfExtras!.finishing ?? null, lfKit: a.lfExtras!.kit ?? null } : {}),
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
      } else if (isSheetProductType(a.productType)) {
        if (!a.bcSheetPaperId) throw new Error("Paper required");
        if (a.bcSides === "two" && !a.bcBackFile && !a.bcBackReuse) {
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
        const front = await upload(localFile);
        const back = a.bcBackFile
          ? await upload(a.bcBackFile)
          : a.bcSides === "two" && a.bcBackReuse
            ? { fileName: a.bcBackReuse.fileName, fileUrl: a.bcBackReuse.fileUrl }
            : null;

        lines.push({
          productType: a.productType,
          designId: a.designId ?? undefined,
          sheetPaperId: a.bcSheetPaperId,
          quantity: priced.quantity,
          cardSides: a.bcSides,
          cardPresetId: a.bcPresetId,
          cardTrimWidthCm: trim.trimWidthCm,
          cardTrimHeightCm: trim.trimHeightCm,
          sticker:
            a.productType === "sticker_sheet" && a.sticker ? stickerLineInput(a.sticker, trim) : undefined,
          postcard: a.productType === "postcard" && a.postcard ? postcardLineInput(a.postcard) : undefined,
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
      } else if (a.productType === "dtf_apparel") {
        const dtfCopies = parseAdminCopiesInput(a.copiesStr);
        if (dtfCopies === null) throw new Error("Invalid copies");
        const dtf: DtfLineInput = requireDtfInput(a);
        const { fileName, fileUrl } = await upload(localFile);
        lines.push({
          productType: "dtf_apparel",
          customerType: a.lfCustomerType,
          dtf,
          designId: a.designId ?? undefined,
          files: [
            {
              fileName,
              fileUrl,
              copies: dtfCopies,
              color: "color",
              paperType: dtfFilePaperType(a, null),
            },
          ],
        });
      } else if (a.productType === "uv_print") {
        const uvCopies = parseAdminCopiesInput(a.copiesStr);
        if (uvCopies === null) throw new Error("Invalid copies");
        const uv: UvLineInput = requireUvInput(a);
        const { fileName, fileUrl } = await upload(localFile);
        lines.push({
          productType: "uv_print",
          customerType: a.lfCustomerType,
          uv,
          designId: a.designId ?? undefined,
          files: [
            {
              fileName,
              fileUrl,
              copies: uvCopies,
              color: "color",
              paperType: uvFilePaperType(a, null),
            },
          ],
        });
      } else if (a.productType === "sublimation_print") {
        const sublCopies = parseAdminCopiesInput(a.copiesStr);
        if (sublCopies === null) throw new Error("Invalid copies");
        const sublimation: SublimationLineInput = requireSublimationInput(a);
        const { fileName, fileUrl } = await upload(localFile);
        lines.push({
          productType: "sublimation_print",
          customerType: a.lfCustomerType,
          sublimation,
          designId: a.designId ?? undefined,
          files: [
            {
              fileName,
              fileUrl,
              copies: sublCopies,
              color: "color",
              paperType: SUBLIMATION_FILE_PAPER_TYPE,
            },
          ],
        });
      } else {
        throw new Error("Unknown product type");
      }
      // Staff «ручная цена», stored on the line; stripped for dealers.
      const pushed = lines[lines.length - 1]!;
      if (a.giftSet) {
        // «Набор»: priced by its set on the server (dealers: the set's dealer price).
        pushed.set = giftSetLineInput(a.giftSet);
        pushed.customerType = a.lfCustomerType;
      } else {
        Object.assign(pushed, manualPriceLineFields(pushed.productType, a.linePriceStr));
      }
      onSlot?.(slot.id, "done");
    }
    // «Набор»: each assembled set's box as its own line (no file), after the set's lines.
    return withGiftSetBoxLines(lines, giftSetTemplates);
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
          undefined,
          giftSetTemplates,
          storedLineTypesRef.current,
          setBoxLineIdsRef.current,
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
        if (dealerMode) {
          await putDealerOrderEdit(editOrderId, lines, customer.notes, false, dealerUrgentForSubmit());
          router.push(backHref);
          router.refresh();
          navigated = true;
          return;
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

      setUploadPhase("uploading");
      setUploadStatuses(
        Object.fromEntries(slots.map((s) => [s.id, "pending"])) as Record<
          string,
          "pending" | "uploading" | "done" | "error"
        >,
      );

      const lines: AdminOrderLineInput[] = await buildCreateLines(uploadFile, (slotId, status) =>
        setUploadStatuses((prev) => ({ ...prev, [slotId]: status })),
      );

      setUploadPhase("creating");
      if (dealerMode) {
        const created = await postDealerOrder(lines, customer.notes, false, dealerUrgentForSubmit());
        router.push(created.id ? `/cabinet/orders/${created.id}` : backHref);
        router.refresh();
        navigated = true;
        return;
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

      router.push(backHref);
      router.refresh();
      navigated = true;
    } catch (err) {
      setError(
        err instanceof Error && err.message === "artwork_larger_than_ordered"
          ? t.fileMeta.check.blocked
          : err instanceof Error && err.message === DEALER_ORDER_LOCKED_CODE
            ? t.dealerOrder.lockedNow
            : err instanceof Error && err.message === "urgency_unavailable"
              ? t.dealerUrgency.unavailableError
            : formatLfAdminOrderSaveError(err, t.admin.newOrderPage, t.dtf.errors, t.uv.errors, t.sublimation.errors),
      );
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

  const [linkInput, setLinkInput] = useState("");

  /** Stored keys the rows already reuse (front and reverse): «уже в заказе» in the picker. */
  const libraryKeysInOrder = useMemo(() => {
    const keys = new Set<string>();
    for (const s of slots) {
      if (s.reuse && !s.file) keys.add(s.reuse.fileUrl);
      const back = assignBySlot[s.id]?.bcBackReuse;
      if (back && assignBySlot[s.id]?.bcSides === "two") keys.add(back.fileUrl);
    }
    return keys;
  }, [slots, assignBySlot]);

  /**
   * «Из библиотеки»: the picked item becomes the row's file (its stored key is
   * reused, nothing is uploaded). `"new"` → first empty row, else a new row on top.
   */
  function pickFromLibrary(item: LibraryItem): void {
    const reuse = reuseFromLibraryItem(item);
    const target = libraryPickFor;
    setLibraryPickFor(null);
    setSlots((prev) => {
      if (target && target !== "new" && prev.some((s) => s.id === target)) {
        return prev.map((s) => (s.id === target ? { ...s, reuse, missingFileName: undefined } : s));
      }
      const emptyIdx = prev.findIndex((s) => !slotHasArtwork(s));
      if (emptyIdx !== -1) {
        return prev.map((s, i) => (i === emptyIdx ? { ...s, reuse, missingFileName: undefined } : s));
      }
      if (prev.length >= MAX_WIZARD_SLOTS) return prev;
      return [{ id: newSlotId(), reuse, sourceOrderLineId: null }, ...prev];
    });
  }

  /** Pasted link → its own row (into the first empty row, else a new one on top). */
  function addLinkSlot(): void {
    const url = linkInput.trim();
    if (!url) return;
    setSlots((prev) => {
      const emptyIdx = prev.findIndex((s) => !slotHasArtwork(s));
      if (emptyIdx !== -1) {
        return prev.map((s, i) => (i === emptyIdx ? { ...s, linkUrl: url } : s));
      }
      if (prev.length >= MAX_WIZARD_SLOTS) return prev;
      return [{ id: newSlotId(), linkUrl: url, sourceOrderLineId: null }, ...prev];
    });
    setLinkInput("");
  }

  function onFilesPick(list: FileList | File[]): void {
    const arr = Array.from(list).slice(0, MAX_WIZARD_SLOTS);
    setSlots((prev) => {
      const merged = [...prev];
      const newRows: AdminWizardSlot[] = [];
      for (const f of arr) {
        const emptyIdx = merged.findIndex((s) => !slotHasArtwork(s));
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
        // A pen / notebook / mug row already is «UV-печать» / «Сублимация».
        if (next[id] && adminProductMenuValue(cur.productType) === bulkProduct) continue;
        // Rows of a «Набор» keep their type (change the set instead).
        if (cur.giftSet) continue;
        const switched: SlotAssign = withPostcardDraft(withStickerDraft(
          withSheetProductPreset({
            ...cur,
            productType: bulkProduct,
            copiesStr: cur.copiesStr,
            linePriceStr:
              bulkProduct === cur.productType ? cur.linePriceStr : "",
            paperPrint:
              bulkProduct === "paper_print"
                ? (cur.paperPrint ?? defaultPaperPrint())
                : null,
          }),
          stickerPaperId,
          bcDefaultSheetPaperId,
        ));
        next[id] = convertPickedDesignerItem(
          next[id],
          withSublimationDraft(
            withUvDraft(
              withDtfDraft(
                isSheetProductType(bulkProduct)
                  ? bcWithWholeSheetQuantity(switched, bcPaperById, "refit")
                  : switched,
                dtfCatalog,
              ),
              uvCatalog,
            ),
            sublimationCatalog,
          ),
          designerCatalogs,
        );
      }
      return next;
    });
  }

  const stepLabels = [
    t.admin.newOrderPage.stepOrderBuilderLabel,
    t.admin.newOrderPage.stepConfirmLabel,
  ];

  function lineSummaries(): ConfirmLine[] {
    const seenSetGroups = new Set<string>();
    return slots.flatMap((s): ConfirmLine[] => {
      const a = assignBySlot[s.id];
      const gs = a?.giftSet ?? null;
      const setTemplate = gs ? giftSetTemplates.find((x) => x.id === gs.templateId) : undefined;
      const setInfo: ConfirmSetInfo | undefined = gs
        ? {
            first: !seenSetGroups.has(gs.groupId),
            label: t.giftSet.badge(setTemplate?.name ?? gs.templateId, gs.quantity),
            role:
              (gs.zoneId ? setTemplate?.zones.find((z) => z.id === gs.zoneId)?.label : undefined) ??
              setTemplate?.components.find((c) => c.role === gs.role)?.label ??
              (gs.role === "ready" ? "" : t.giftSet.roleNames[gs.role]),
            // The box is its own row now (packing note only on the workshop board).
            note: null,
          }
        : undefined;
      if (gs) seenSetGroups.add(gs.groupId);
      let cop = a ? a.copiesStr : "—";
      // Sticker sheets: the run with its unit («5 листов A3+» / «240 шт»).
      if (a?.productType === "sticker_sheet" && a.sticker) {
        const n = Number.parseInt(a.copiesStr, 10);
        if (Number.isInteger(n) && n > 0) {
          cop =
            a.sticker.quantityMode === "sheets"
              ? t.admin.stickerSheet.runSheets(stickerRoundSheets(n, a.sticker.format), a.sticker.format)
              : t.admin.stickerSheet.runPieces(n);
        }
      }
      // Postcards on whole sheets: «7 л. A3+ целиком».
      if (a?.productType === "postcard" && a.postcard?.wholeSheet) {
        const n = Number.parseInt(a.copiesStr, 10);
        if (Number.isInteger(n) && n > 0) cop = t.admin.postcard.runSheets(n, a.postcard.format);
      }
      let product = "—";
      if (a?.productType === "paper_print") product = t.mug.productPaperPrint;
      else if (a?.productType === "mug") product = `${t.sublimation.productType} · ${t.mug.productMug}`;
      else if (a?.productType === "notebook") product = `${t.uv.productType} · ${t.notebook.productNotebook}`;
      else if (a?.productType === "pen") product = `${t.uv.productType} · ${t.admin.productTypePen}`;
      else if (a?.productType === "large_format_print")
        product = t.admin.productTypeLargeFormat;
      else if (a?.productType === "business_card")
        product = t.admin.productTypeBusinessCard;
      else if (a?.productType === "flyer") product = t.admin.productTypeFlyer;
      else if (a?.productType === "sticker_sheet") product = t.admin.productTypeStickerSheet;
      else if (a?.productType === "postcard")
        product = `${t.admin.productTypePostcard}${a.postcard ? ` · ${t.admin.postcard.purposes[a.postcard.purpose]}` : ""}`;
      else if (a?.productType === "dtf_apparel") product = t.dtf.productType;
      else if (a?.productType === "uv_print")
        product = a.uv?.source === "stickers" ? t.productPicker.uvDtfStickers : t.uv.productType;
      else if (a?.productType === "sublimation_print") product = t.sublimation.productType;
      const setItem = a ? giftSetRowItem(a) : null;
      const readyZone = gs?.role === "ready" ? readySetZone(gs) : null;
      const row: ConfirmLine = {
        id: s.id,
        name: slotArtworkName(s) ?? t.admin.newOrderPage.fileNotChosenPlaceholder,
        product:
          gs?.role === "ready" && setTemplate && gs.zoneId
            ? readyZoneLineType(gs.zoneId) === "notebook"
              ? `${t.uv.productType} · ${t.notebook.productNotebook}`
              : readyZoneLineType(gs.zoneId) === "pen"
                ? `${t.uv.productType} · ${t.admin.productTypePen}`
                : t.uv.productType
            : product,
        copies: cop,
        ...(setInfo
          ? {
              set: {
                ...setInfo,
                ...(setItem
                  ? {
                      item:
                        gs?.role === "ready" && readyZone
                          ? readySetUvDescription(readyZone, setItem.variantLabel ?? null)
                          : `${setItem.itemNames.ru ?? setItem.name}${setItem.variantLabel ? ` · ${setItem.variantLabel}` : ""}`,
                      // A ready set's notebook / pen: the type icon, not the whole-set photo.
                      ...(gs?.role === "ready" && gs.zoneId && (readyZoneLineType(gs.zoneId) === "notebook" || readyZoneLineType(gs.zoneId) === "pen")
                        ? { imageUrl: null, icon: readyZoneLineType(gs.zoneId) as "notebook" | "pen" }
                        : { imageUrl: setItem.imageUrl }),
                      swatch: giftSetSwatchHex(setItem),
                    }
                  : {}),
                // «Термос из набора · чёрный» already names the component.
                ...(gs?.role === "ready" && readyZone && setItem ? { role: "" } : {}),
              },
            }
          : {}),
      };
      // «Набор»: the set's box row after its last item.
      const box = giftSetBoxRowsBySlot.get(s.id);
      if (!box || !setInfo) return [row];
      const ready = box.kind === "ready";
      const variantItem = ready && box.variantId ? uvCatalog.items.find((i) => i.id === box.variantId) : undefined;
      return [
        row,
        {
          id: `box-${box.groupId}`,
          name: ready ? t.giftSet.readyUnitNoFile : t.giftSet.boxNoFile,
          // Shown after the role («Набор с термосом · чёрный» / «Коробка набора · 30×23×8,5»): its SKU / the box item's own name.
          product: ready ? box.boxSku : (bootstrap.giftSetBoxNames?.[box.boxSku] ?? box.boxSku),
          copies: String(box.quantity),
          set: {
            first: false,
            label: setInfo.label,
            role: box.name,
            note: null,
            box: true,
            item: box.boxSku,
            imageUrl: ready ? (variantItem?.imageUrl ?? null) : (bootstrap.giftSetBoxImages?.[box.boxSku] ?? null),
            swatch: variantItem ? giftSetSwatchHex(variantItem) : null,
            icon: ready ? "gift" : "box",
          },
        },
      ];
    });
  }

  if (editOrderId && editNotFound) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-4 py-16 text-center text-gray-900">
        <h1 className="text-xl font-bold sm:text-2xl">{t.admin.editOrderPage.notFoundTitle}</h1>
        <p className="text-sm text-gray-600">{t.admin.editOrderPage.notFoundText}</p>
        <NavLinkButton
          href={backHref}
          variant="outline"
          size="sm"
          prefetch
          className="mt-2 gap-1"
          leadingIcon={<ChevronLeft className="h-4 w-4" />}
        >
          {t.admin.editOrderPage.backToOrders}
        </NavLinkButton>
      </div>
    );
  }

  return (
    <>
      <AdminConfirmDialog
        open={giftSetRemove !== null}
        title={t.giftSet.removeConfirmTitle(giftSetRemove?.name ?? "")}
        description={t.giftSet.removeConfirm}
        confirmLabel={t.giftSet.remove}
        cancelLabel={t.giftSet.cancel}
        onConfirm={() => {
          if (giftSetRemove) removeSlotIds(giftSetRemove.ids);
          setGiftSetRemove(null);
        }}
        onClose={() => setGiftSetRemove(null)}
      />
      <AdminConfirmDialog
        open={giftSetLeave !== null}
        title={t.giftSet.leaveConfirmTitle(giftSetLeave?.role ?? "mug", giftSetLeave?.run != null)}
        description={t.giftSet.leaveConfirm}
        confirmLabel={giftSetLeave?.run != null ? t.giftSet.leaveChange : t.giftSet.leaveRemove}
        cancelLabel={t.giftSet.cancel}
        onConfirm={() => {
          if (giftSetLeave) {
            dissolveGiftSet(giftSetLeave.slotId, giftSetLeave.run == null);
            giftSetLeave.run?.();
          }
          setGiftSetLeave(null);
        }}
        onClose={() => setGiftSetLeave(null)}
      />
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
      {repeatOrderId ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="repeat-order-banner">
          {editLoading
            ? t.library.repeatLoading
            : slots.some((sl) => sl.missingFileName && !slotHasArtwork(sl))
              ? t.library.repeatMissing
              : t.library.repeatOk}
        </p>
      ) : null}

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
            {!editOrderId && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                  <Link2 className="h-3.5 w-3.5" aria-hidden />
                  <span>{t.upload.orPasteLink}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addLinkSlot();
                      }
                    }}
                    placeholder={t.upload.linkPlaceholder}
                    className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={!linkInput.trim() || slots.filter(slotHasArtwork).length >= MAX_WIZARD_SLOTS}
                    onClick={addLinkSlot}
                  >
                    {t.upload.addLink}
                  </Button>
                </div>
              </div>
            )}
            {!dealerMode && (
              <div className="flex justify-center">
                <WizardLibraryPickButton
                  label={t.library.addFromLibrary}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50/60 px-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
                  onClick={() => setLibraryPickFor("new")}
                />
              </div>
            )}
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
                {dealerMode ? (
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      {t.cabinet.newOrder.wizardNotesTitle}
                    </span>
                    <textarea
                      className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                      rows={3}
                      maxLength={500}
                      placeholder={t.cabinet.newOrder.notesPlaceholder}
                      value={customer.notes}
                      onChange={(e) => setCustomer((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                  </label>
                ) : (
                  <AdminCustomerForm
                    value={customer}
                    onChange={setCustomer}
                    t={t}
                    urgencyFeeMdl={staffUrgencyFeeMdl}
                  />
                )}
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
                    <ProductTypeMenu
                      className="min-w-[10rem] max-w-md flex-1 sm:min-w-[11rem]"
                      value={bulkProduct}
                      options={ADMIN_LINE_PRODUCT_TYPES}
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
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "24%" }} />
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

                        const suggestedUnitMdl = catalogUnitMdl(
                          a,
                          mugById,
                          nbById,
                          penById,
                          uvCatalog,
                        );
                        const designerUv: UvLineData | null = designerUvLine(a, uvCatalog);
                        const designerUvPanel =
                          designerUv && (a.productType === "notebook" || a.productType === "pen") ? (
                            <UvProfitPanel
                              data={designerUv}
                              t={t}
                              locale={locale}
                              costsIncludeVat={printEconomics?.purchaseCostsIncludeVat ?? true}
                              hideCosts={dealerMode}
                              sell={
                                a.giftSet
                                  ? {
                                      // «Набор»: the row's share of the set price.
                                      unitPriceMdl:
                                        a.giftSet.quantity > 0
                                          ? Math.round((slotLineTotalMdl(s.id) / a.giftSet.quantity) * 100) / 100
                                          : 0,
                                      manual: true,
                                      totalMdl: slotLineTotalMdl(s.id),
                                    }
                                  : {
                                      unitPriceMdl: parsedLinePriceMdl(a.linePriceStr) ?? designerUv.pricing.unitItemPriceMdl,
                                      manual: parsedLinePriceMdl(a.linePriceStr) != null,
                                      ...(a.productType === "pen" ? { totalMdl: slotLineTotalMdl(s.id) } : {}),
                                    }
                              }
                            />
                          ) : null;
                        let pricePlaceholder =
                          suggestedUnitMdl != null
                            ? String(suggestedUnitMdl)
                            : "";
                        let lfBillingRollWidthM: number | null = null;
                        let lfBillingMaterialName: string | null = null;
                        let lfBillingDimsW: number | null = null;
                        let lfBillingDimsH: number | null = null;
                        const familyGroupSlot = lfFamilyGroupData.get(s.id);
                        if (a.productType === "dtf_apparel") {
                          const dtfQuote = dtfSlotQuote(a, dtfCatalog);
                          pricePlaceholder = dtfQuote?.ok
                            ? String(dtfQuote.data.pricing.totalSellPriceMdl)
                            : "";
                        }
                        if (a.productType === "uv_print") {
                          const uvQuote = uvSlotQuote(a, uvCatalog);
                          pricePlaceholder = uvQuote?.ok
                            ? String(uvQuote.data.pricing.totalSellPriceMdl)
                            : "";
                        }
                        if (a.productType === "sublimation_print") {
                          const sublQuote = sublimationSlotQuote(a, sublimationCatalog);
                          pricePlaceholder = sublQuote?.ok
                            ? String(sublQuote.data.pricing.totalSellPriceMdl)
                            : "";
                        }
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
                          slotArtworkName(s) ??
                          s.missingFileName ??
                          t.admin.newOrderPage.fileNotChosenPlaceholder;
                        const layoutFocusAnchor =
                          Boolean(
                            editOrderId &&
                              focusOrderLineParam &&
                              wizardLineKey(s) === focusOrderLineParam,
                          ) && firstSlotIdByLineKey.get(lk) === s.id;

                        // «Набор»: the set's rows are one tinted group — header (once), item rows, box row.
                        const setGs = a.giftSet ?? null;
                        const setFirst = setGs ? giftSetGroupSlotIds(s.id, giftSetRows())[0] === s.id : false;
                        const setBoxRow = setGs ? (giftSetBoxRowsBySlot.get(s.id) ?? null) : null;
                        return (
                          <Fragment key={s.id}>
                          {setGs && setFirst ? renderGiftSetHeaderRow(s, setGs) : null}
                          <tr
                            id={
                              layoutFocusAnchor
                                ? "wizard-layout-focus"
                                : undefined
                            }
                            className={cn("border-b border-gray-100", setGs && "bg-fuchsia-50/30")}
                            data-gift-set-group={setGs?.groupId}
                          >
                            <td className={cn("min-w-0 py-2 pl-3 pr-2 align-top", setGs && "border-l-4 border-l-fuchsia-300")}>
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
                                {(s.file || s.existingFile) && (
                                  <ArtworkSizeCheckLine
                                    className="ml-7"
                                    file={s.file ?? null}
                                    fileId={s.existingFile?.id ?? null}
                                    metaEndpoint={dealerMode ? CABINET_FILE_META_ENDPOINT : undefined}
                                    declared={
                                      a.giftSet
                                        ? giftSetDeclaredSize(a)
                                        : slotDeclaredSize(a, s.existingFile?.paperType ?? null, dtfCatalog)
                                    }
                                    itemSize={!a.giftSet && a.productType === "uv_print" && a.uv ? uvDraftItemSize(a.uv) : null}
                                  />
                                )}
                                {s.reuse && !s.file ? (
                                  <WizardReuseInfo
                                    reuse={s.reuse}
                                    onClear={() =>
                                      setSlots((prev) =>
                                        prev.map((row) => (row.id === s.id ? { ...row, reuse: undefined } : row)),
                                      )
                                    }
                                  />
                                ) : null}
                                {!slotHasArtwork(s) && s.missingFileName ? (
                                  <WizardMissingFileNote fileName={s.missingFileName} />
                                ) : null}
                {s.expiredPhotoCount ? <WizardExpiredPhotosNote count={s.expiredPhotoCount} /> : null}
                                {s.linkUrl && linkNotAllowedFor(a.productType) ? (
                                  <p className="ml-7 text-[11px] font-medium text-red-600">
                                    {t.admin.newOrderPage.linkNeedsFile}
                                  </p>
                                ) : null}
                                {!slotHasArtwork(s) && !dealerMode ? (
                                  <WizardLibraryPickButton onClick={() => setLibraryPickFor(s.id)} />
                                ) : null}
                                {!slotHasArtwork(s) ? (
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
                                {a.giftSet && slotHasArtwork(s) ? (
                                  // «Набор»: a new file for this row only (the set stays; «Убрать» removes the whole set).
                                  <FileDropzone
                                    onFiles={(files) => {
                                      const f = files[0];
                                      if (f) {
                                        setSlots((prev) =>
                                          prev.map((row) =>
                                            row.id === s.id ? { ...row, file: f, linkUrl: undefined } : row,
                                          ),
                                        );
                                      }
                                    }}
                                    ariaLabel={t.giftSet.replaceFile}
                                    className="ml-7 flex cursor-pointer rounded text-xs font-medium text-gold hover:text-amber-900"
                                    dragActiveClassName="bg-gold-light/50 outline-2 outline-dashed outline-gold"
                                  >
                                    <span data-testid="gift-set-replace-file">{t.giftSet.replaceFile}</span>
                                  </FileDropzone>
                                ) : null}
                                {editOrderId && !a.giftSet &&
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
                            {a.giftSet?.role === "ready" ? (
                              renderGiftSetCells(
                                s,
                                a,
                                a.giftSet.role === "ready"
                                  ? (readySetLayoutCheck(s.id, a) ?? null)
                                  : a.productType === "mug" ? mugV : a.productType === "notebook" ? nbV : a.productType === "pen" ? penV : null,
                              )
                            ) : (
                            <>
                            <td className="min-w-0 px-2.5 py-2 align-top">
                              {(() => {
                                const menuState: RowMenuState = slotMenuState(a);
                                return (
                                  <>
                                    {/* An assembled «Набор» row: the set badge over the row's normal product picker. */}
                                    {a.giftSet ? renderGiftSetRowBadge(a.giftSet) : null}
                                    <ProductTypeMenu
                                      className="w-full max-w-full min-w-0"
                                      value={adminProductMenuValue(a.productType)}
                                      options={ADMIN_LINE_PRODUCT_TYPES}
                                      onChange={(pt) => {
                                        // Pen / notebook / mug rows are shown as their print method.
                                        if (pt === adminProductMenuValue(a.productType)) return;
                                        // Another type takes a set row out of its set (confirm, the set dissolves).
                                        guardSetRowChange(s.id, null, () => updateSlot(s.id, { productType: pt }));
                                      }}
                                      buttonClassName="text-sm"
                                      stockCategories={stockMenuTiles}
                                      stockGroupLabel={t.productPicker.stockGroup}
                                      selectedStockCategory={
                                        menuState.kind === "stock" ? menuState.entry.categoryCode : null
                                      }
                                      onPickStockCategory={(code) => setStockPicker({ slotId: s.id, category: code })}
                                      clientServices={clientServiceTiles}
                                      clientGroupLabel={t.productPicker.clientGroup}
                                      selectedClientService={menuState.kind === "client" ? (menuState.service ?? menuState.method) : null}
                                      onPickClientService={(type) =>
                                        guardSetRowChange(s.id, null, () => pickSlotClientService(s.id, type))
                                      }
                                      current={slotMenuCurrent(menuState)}
                                      giftSetEntry={
                                        !a.giftSet && giftSetTemplates.some((x) => x.active)
                                          ? {
                                              title: t.giftSet.typeLabel,
                                              hint: t.giftSet.typeHint,
                                              onPick: () => setGiftSetDialog({ slotId: s.id, initial: null }),
                                            }
                                          : null
                                      }
                                    />
                                    {a.productType === "paper_print" && !dismissedTypeHints.has(s.id) && (
                                      <LineTypeHint
                                        hints={suggestLineTypes(typeHintInputForSlot(s, customer.notes))}
                                        t={t}
                                        onSwitch={(target) => applyTypeHint(s.id, target)}
                                        onDismiss={() =>
                                          setDismissedTypeHints((prev) => new Set(prev).add(s.id))
                                        }
                                      />
                                    )}
                                    {menuState.kind === "stock" && menuState.entry.methods.length > 1 && (
                                      <div
                                        className="mt-1.5 inline-flex rounded-lg bg-gray-100 p-0.5"
                                        role="radiogroup"
                                        aria-label={t.productPicker.methodSwitch}
                                      >
                                        {menuState.entry.methods.map((m) => (
                                          <button
                                            key={m}
                                            type="button"
                                            role="radio"
                                            aria-checked={menuState.method === m}
                                            className={cn(
                                              "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                                              menuState.method === m
                                                ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                                                : "text-gray-500 hover:text-gray-800",
                                            )}
                                            onClick={() => {
                                              if (m === menuState.method) return;
                                              const entryId = menuState.entry.id;
                                              guardSetRowChange(
                                                s.id,
                                                {
                                                  productType:
                                                    m === "dtf_apparel" ? m : (designerProductForVariant(designerCatalogs, m, entryId) ?? m),
                                                  stockItem: true,
                                                },
                                                () => pickSlotStockItem(s.id, entryId, m),
                                              );
                                            }}
                                          >
                                            {methodTitle(m)}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="min-w-0 px-2.5 py-2 align-top">
                              {isDesignerProductType(a.productType) && (
                                <DesignerLineMethodHeader
                                  customerType={a.lfCustomerType}
                                  method={printMethodForDesignerProduct(a.productType)!}
                                  product={a.productType}
                                  items={
                                    a.productType === "mug"
                                      ? sublimationCatalog.items
                                      : uvCatalog.items
                                  }
                                  variantId={designerRowVariantId(a)}
                                  onPick={(pick) =>
                                    // Another mug / notebook / pen keeps a set row in its set; anything else dissolves it (confirm).
                                    guardSetRowChange(
                                      s.id,
                                      {
                                        productType:
                                          pick.source === "stock"
                                            ? designerProductForVariant(
                                                designerCatalogs,
                                                printMethodForDesignerProduct(a.productType)!,
                                                pick.variantId,
                                              )
                                            : null,
                                        stockItem: pick.source === "stock",
                                      },
                                      () => pickSlotPrintMethodItem(s.id, pick),
                                    )
                                  }
                                  onOpenPicker={() => {
                                    const st: RowMenuState = slotMenuState(a);
                                    setStockPicker({ slotId: s.id, category: st.kind === "stock" ? st.entry.categoryCode : null });
                                  }}
                                  t={t}
                                  locale={locale}
                                />
                              )}
                              {a.productType === "mug" && (
                                <div className="flex min-w-0 items-start gap-2.5 py-0.5">
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    {a.mugPick?.type === "catalog" && mugCat && !s.linkUrl ? (
                                      <div className="text-[10px] leading-snug">
                                        {mugV == null ? (
                                          <span className="text-gray-500">
                                            {t.admin.newOrderPage.layoutCheckPending}
                                          </span>
                                        ) : mugV.unreadable ? (
                                          <span className="text-amber-700">
                                            {t.admin.newOrderPage.layoutCheckUnreadable}
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
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    {a.nbPick?.type === "catalog" && nbCat && !s.linkUrl ? (
                                      <div className="text-[10px] leading-snug">
                                        {nbV == null ? (
                                          <span className="text-gray-500">
                                            {t.admin.newOrderPage.layoutCheckPending}
                                          </span>
                                        ) : nbV.unreadable ? (
                                          <span className="text-amber-700">
                                            {t.admin.newOrderPage.layoutCheckUnreadable}
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
                                  <div className="min-w-0 flex-1 space-y-1.5">
                                    {a.penPick?.type === "catalog" && penCat && !s.linkUrl ? (
                                      <div className="text-[10px] leading-snug">
                                        {penV == null ? (
                                          <span className="text-gray-500">
                                            {t.admin.newOrderPage.layoutCheckPending}
                                          </span>
                                        ) : penV.unreadable ? (
                                          <span className="text-amber-700">
                                            {t.admin.newOrderPage.layoutCheckUnreadable}
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
                              {designerUvPanel && <div className="mt-1.5">{designerUvPanel}</div>}
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
                                      // «Line total» = print + storefront finishing / roll-up set (same as the line price).
                                      const lfTotals =
                                        lfResult && lfResult.ok && qCop !== null
                                          ? lfWizardLineTotalBreakdownMdl(
                                              lfResult.pricing.totalSellPrice,
                                              { widthCm: wp, heightCm: hp, quantity: qCop },
                                              a.lfExtras,
                                            )
                                          : null;
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
                                          {hasLfLineExtras(a.lfExtras) ? (
                                            // Finishing / roll-up set from the storefront: kept on save, priced on top.
                                            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
                                              Отделка:{" "}
                                              {lfLineExtrasInputRu(
                                                {
                                                  widthCm: Number.isFinite(wp) ? wp : 0,
                                                  heightCm: Number.isFinite(hp) ? hp : 0,
                                                  quantity: parseAdminCopiesInput(a.copiesStr) ?? 1,
                                                },
                                                a.lfExtras,
                                              )}
                                            </p>
                                          ) : null}
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
                                                          {lfTotals && lfTotals.extrasMdl !== 0 ? (
                                                            <>
                                                              <span>{t.admin.newOrderPage.lfExtrasSell}</span>
                                                              <span className="text-right tabular-nums">
                                                                {lfTotals.extrasMdl}{" "}
                                                                {t.admin.currency}
                                                              </span>
                                                            </>
                                                          ) : null}
                                                          <span className="font-semibold">
                                                            {t.admin.newOrderPage.lfTotal}
                                                          </span>
                                                          <span className="text-right font-semibold tabular-nums">
                                                            {lfTotals?.totalMdl ?? lfResult.pricing.totalSellPrice}{" "}
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
                                                                sellOnCostBasis(
                                                                  lfResult.pricing.totalSellPrice,
                                                                  printEconomics.purchaseCostsIncludeVat,
                                                                ) - econ.totalDirectCostMdl;
                                                              const marginPercent: number =
                                                                marginPercentOnCostBasis(
                                                                  lfResult.pricing.totalSellPrice,
                                                                  econ.totalDirectCostMdl,
                                                                  printEconomics.purchaseCostsIncludeVat,
                                                                );
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
                                                                    {marginPercent}%
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
                                                          {lfTotals && lfTotals.extrasMdl !== 0 ? (
                                                            <>
                                                              <span>{t.admin.newOrderPage.lfExtrasSell}</span>
                                                              <span className="text-right tabular-nums">
                                                                {lfTotals.extrasMdl}{" "}
                                                                {t.admin.currency}
                                                              </span>
                                                            </>
                                                          ) : null}
                                                          <span className="font-semibold">
                                                            {t.admin.newOrderPage.lfTotal}
                                                          </span>
                                                          <span className="text-right font-semibold tabular-nums">
                                                            {lfTotals?.totalMdl ?? lfResult.pricing.totalSellPrice}{" "}
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
                              {a.productType === "sticker_sheet" && a.sticker && (
                                <StickerSheetRowFields
                                  draft={a.sticker}
                                  copiesStr={a.copiesStr}
                                  paper={a.bcSheetPaperId ? (bcPaperById.get(a.bcSheetPaperId) ?? null) : null}
                                  pricing={bcSlotPricing(a, bcPaperById, bcMinimumLineTotalMdlEffective)}
                                  layout={bcSlotLayout(a, bcPaperById)?.layout ?? null}
                                  settings={wizardStickerSettings}
                                  artworkFile={s.file ?? null}
                                  onChange={(patch) => updateSlot(s.id, patch)}
                                  t={t}
                                  hideStock={dealerMode}
                                  dealerView={dealerMode}
                                  manualTotalMdl={dealerMode ? null : parsedLinePriceMdl(a.linePriceStr)}
                                />
                              )}
                              {isSheetProductType(a.productType) && a.productType !== "sticker_sheet" && (
                                <AdminBusinessCardRowFields
                                  productType={a.productType}
                                  assign={a}
                                  papers={bcPaperItems}
                                  pricing={bcSlotPricing(
                                    a,
                                    bcPaperById,
                                    bcMinimumLineTotalMdlEffective,
                                  )}
                                  cardsPerSheet={
                                    bcSlotLayout(a, bcPaperById)?.layout
                                      .cardsPerSheet ?? 0
                                  }
                                  packQuantities={
                                    a.productType === "business_card" && a.lfCustomerType === "retail"
                                      ? SHOP_BC_PACKS
                                      : undefined
                                  }
                                  onCustomSizeCommit={() => {
                                    const refit = bcWithWholeSheetQuantity(
                                      a,
                                      bcPaperById,
                                      "refit",
                                    );
                                    if (refit !== a) {
                                      updateSlot(s.id, {
                                        copiesStr: refit.copiesStr,
                                      });
                                    }
                                  }}
                                  frontArtwork={bcArtworkVerdict(
                                    bcArtworkKeys(s, a).front,
                                    a,
                                    bcArtworkSizes,
                                  )}
                                  backArtwork={bcArtworkVerdict(
                                    bcArtworkKeys(s, a).back,
                                    a,
                                    bcArtworkSizes,
                                  )}
                                  onChange={(patch) =>
                                    updateSlot(
                                      s.id,
                                      // A folded A5 is creased: picking it starts with one line.
                                      a.productType === "postcard" &&
                                        a.postcard &&
                                        patch.bcPresetId === POSTCARD_FOLDED_PRESET_ID &&
                                        a.postcard.creaseLines === 0
                                        ? { ...patch, postcard: { ...a.postcard, creaseLines: 1 } }
                                        : patch,
                                    )
                                  }
                                  t={t}
                                  hideStock={dealerMode}
                                  dealerView={dealerMode}
                                  manualTotalMdl={dealerMode ? null : parsedLinePriceMdl(a.linePriceStr)}
                                  hideSize={a.productType === "postcard" && a.postcard?.wholeSheet === true}
                                  hideSummary={a.productType === "postcard"}
                                  before={
                                    a.productType === "postcard" && a.postcard ? (
                                      <PostcardPurposeFields
                                        draft={a.postcard}
                                        onChange={(postcard) => {
                                          // A purpose starts with its usual size (only when it changes).
                                          const preset =
                                            postcard.purpose !== a.postcard!.purpose
                                              ? POSTCARD_PURPOSE_DEFAULT_PRESET[postcard.purpose]
                                              : null;
                                          updateSlot(s.id, preset ? { postcard, bcPresetId: preset } : { postcard });
                                        }}
                                        t={t}
                                      />
                                    ) : null
                                  }
                                  after={
                                    a.productType === "postcard" && a.postcard ? (
                                      <PostcardFinishingFields
                                        draft={a.postcard}
                                        effectiveFormat={postcardEffectiveFormat(a)}
                                        layout={bcSlotLayout(a, bcPaperById)?.layout ?? null}
                                        pricing={bcSlotPricing(a, bcPaperById, bcMinimumLineTotalMdlEffective)}
                                        paper={a.bcSheetPaperId ? (bcPaperById.get(a.bcSheetPaperId) ?? null) : null}
                                        settings={wizardPostcardSettings}
                                        artworkFile={s.file ?? null}
                                        onChange={(postcard) => updateSlot(s.id, { postcard })}
                                        t={t}
                                        hideStock={dealerMode}
                                        dealerView={dealerMode}
                                        manualTotalMdl={dealerMode ? null : parsedLinePriceMdl(a.linePriceStr)}
                                      />
                                    ) : null
                                  }
                                />
                              )}
                              {a.productType === "dtf_apparel" && a.dtf && (
                                <DtfLineEditor
                                  value={a.dtf}
                                  onChange={(dtf) => updateSlot(s.id, { dtf })}
                                  catalog={dtfCatalog}
                                  hideCosts={dealerMode}
                                  showSourceToggle={false}
                                  pickerItems={stockEntries}
                                  onOpenGarmentPicker={() => {
                                    const st: RowMenuState = slotMenuState(a);
                                    setStockPicker({ slotId: s.id, category: st.kind === "stock" ? st.entry.categoryCode : null });
                                  }}
                                  quote={dtfSlotQuote(a, dtfCatalog) ?? { ok: false, code: "dtf_incomplete" }}
                                  customerType={a.lfCustomerType}
                                  layoutChoices={slots.flatMap((o, oi) => {
                                    const oa = assignBySlot[o.id];
                                    if (o.id === s.id || oa?.productType !== "dtf_apparel" || !oa.dtf) return [];
                                    const g = dtfCatalog.garments.find((x) => x.id === oa.dtf?.garmentProductId);
                                    return [{ id: o.id, position: oi + 1, label: g ? `${g.name} ${g.colorName}`.trim() : null }];
                                  })}
                                  sameLayoutAs={
                                    a.dtf.layoutKey
                                      ? (slots.find(
                                          (o) => o.id !== s.id && assignBySlot[o.id]?.dtf?.layoutKey === a.dtf?.layoutKey,
                                        )?.id ?? null)
                                      : null
                                  }
                                  onSameLayoutChange={(otherId) => setDtfSameLayout(s.id, otherId)}
                                  t={t}
                                  locale={locale}
                                />
                              )}
                              {a.productType === "uv_print" && a.uv && (
                                <UvLineEditor
                                  customerType={a.lfCustomerType}
                                  value={a.uv}
                                  onChange={(uv) => updateSlot(s.id, { uv })}
                                  catalog={uvCatalog}
                                  hideCosts={dealerMode}
                                  onOpenItemPicker={() => {
                                    const st: RowMenuState = slotMenuState(a);
                                    setStockPicker({ slotId: s.id, category: st.kind === "stock" ? st.entry.categoryCode : null });
                                  }}
                                  quote={uvSlotQuote(a, uvCatalog) ?? { ok: false, code: "uv_incomplete" }}
                                  t={t}
                                  locale={locale}
                                  costsIncludeVat={printEconomics?.purchaseCostsIncludeVat ?? true}
                                  requireItemDetails={dealerMode && !a.giftSet}
                                  artwork={{
                                    file: s.file ?? null,
                                    url: s.existingFile
                                      ? dealerMode
                                        ? `/api/cabinet/files/${s.existingFile.id}/preview`
                                        : `/api/preview/${s.existingFile.id}`
                                      : null,
                                    fileName: s.existingFile?.fileName ?? null,
                                  }}
                                />
                              )}
                              {a.productType === "sublimation_print" && a.sublimation && (
                                <SublimationLineEditor
                                  customerType={a.lfCustomerType}
                                  value={a.sublimation}
                                  onChange={(sublimation) => updateSlot(s.id, { sublimation })}
                                  catalog={sublimationCatalog}
                                  hideCosts={dealerMode}
                                  quote={
                                    sublimationSlotQuote(a, sublimationCatalog) ?? { ok: false, code: "subl_incomplete" }
                                  }
                                  t={t}
                                  locale={locale}
                                  costsIncludeVat={printEconomics?.purchaseCostsIncludeVat ?? true}
                                  onOpenItemPicker={() => {
                                    const st: RowMenuState = slotMenuState(a);
                                    setStockPicker({ slotId: s.id, category: st.kind === "stock" ? st.entry.categoryCode : null });
                                  }}
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
                            {a.giftSet ? (
                              renderGiftSetPriceQtyCells(s, a.giftSet)
                            ) : (
                            <>
                            <td className="min-w-0 px-1 py-2 align-top text-center tabular-nums">
                              <div className="flex flex-col items-center gap-0.5">
                                {dealerMode ? (
                                  <span className="py-1 text-[13px] font-medium tabular-nums text-gray-900">
                                    {(() => {
                                      const total: number = slotLineTotalMdl(s.id);
                                      if (total > 0) return formatAmountMdl(total, t.admin.currency);
                                      return slotHasNoPrice(s.id) ? (
                                        <span className="text-[11px] font-normal leading-tight text-gray-500">
                                          {t.cabinet.newOrder.studioPricesLine}
                                        </span>
                                      ) : (
                                        "—"
                                      );
                                    })()}
                                  </span>
                                ) : (
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
                                )}
                                {!dealerMode &&
                                  !isSheetProductType(a.productType) &&
                                  parsedLinePriceMdl(a.linePriceStr) != null && (
                                    // Manual price kept on qty / size changes: show the calculated one next to it.
                                    <span className="text-[10px] font-medium leading-tight text-amber-800">
                                      {(() => {
                                        const computed: number | null =
                                          pricePlaceholder !== "" && Number.isFinite(Number(pricePlaceholder))
                                            ? Number(pricePlaceholder)
                                            : null;
                                        return isManualUnitPriceType(a.productType)
                                          ? t.admin.manualUnitPriceNote(computed)
                                          : t.admin.sheetManualPriceNote(computed);
                                      })()}
                                    </span>
                                  )}
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
                                maxLength={a.productType === "sticker_sheet" ? 6 : a.productType === "flyer" || a.productType === "postcard" ? 5 : 4}
                                readOnly={
                                  a.productType === "dtf_apparel" ||
                                  a.productType === "uv_print" ||
                                  a.productType === "sublimation_print"
                                }
                                className={cn(
                                  "mx-auto block w-full min-w-[3.75rem] max-w-[4.5rem] rounded-md border border-gray-300 px-2 py-1 text-center text-sm tabular-nums",
                                  (a.productType === "dtf_apparel" ||
                                    a.productType === "uv_print" ||
                                    a.productType === "sublimation_print") &&
                                    "bg-gray-50 text-gray-500",
                                )}
                                value={a.copiesStr}
                                onChange={(e) =>
                                  updateSlot(s.id, {
                                    // Digits only: letters made the row drop out of the total.
                                    copiesStr: e.target.value.replace(/\D/g, ""),
                                  })
                                }
                                onBlur={() => {
                                  if (!isSheetProductType(a.productType)) return;
                                  const rounded = bcWithWholeSheetQuantity(
                                    a,
                                    bcPaperById,
                                    "round_up",
                                  );
                                  if (rounded !== a) {
                                    updateSlot(s.id, {
                                      copiesStr: rounded.copiesStr,
                                    });
                                  }
                                }}
                              />
                            </td>
                            </>
                            )}
                            </>
                            )}
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
                          {setBoxRow ? renderGiftSetBoxRow(setBoxRow) : null}
                          </Fragment>
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
                                ? `${formatAmountMdl(
                                    orderLinesSubtotalMdl,
                                    t.admin.currency,
                                  )}${dealerMode && anySlotHasNoPrice ? " +" : ""}`
                                : "—"}
                            </p>
                            {dealerMode && anySlotHasNoPrice && (
                              <p className="mt-1 max-w-[14rem] text-[11px] font-normal leading-tight text-gray-500">
                                {orderLinesSubtotalMdl > 0
                                  ? t.cabinet.newOrder.wizardTotalPartial
                                  : t.cabinet.newOrder.studioPricesLine}
                              </p>
                            )}
                          </div>
                        </td>
                        <td colSpan={2} className="py-2 pr-3" aria-hidden />
                      </tr>
                    </tfoot>
                  </table>
                  {!dealerMode &&
                  printEconomics &&
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
          <MultiConfirmStep
            t={t}
            editing={Boolean(editOrderId)}
            customer={customer}
            lines={lineSummaries()}
            dealerQuote={dealerMode ? dealerQuote : null}
            dealerUrgent={dealerUrgent}
            onDealerUrgentChange={setDealerUrgent}
          />
        )}

        {editLoadError && (
          <p className="mt-4 text-sm text-red-600 text-center">
            {editLoadError === DEALER_ORDER_LOCKED_CODE ? t.dealerOrder.lockedNow : editLoadError}
          </p>
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
                          {slotArtworkName(s) ?? "—"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        )}

        {step !== "confirm" && !submitting && (() => {
          const blockers: string[] = advanceBlockers();
          if (blockers.length === 0) return null;
          return (
            <div
              role="status"
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:ml-auto sm:max-w-xl"
            >
              <p className="font-medium">{t.admin.newOrderPage.advanceBlockersTitle}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {blockers.slice(0, 6).map((b, i) => (
                  <li key={i} className="break-words">{b}</li>
                ))}
                {blockers.length > 6 && <li>…</li>}
              </ul>
            </div>
          );
        })()}

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
      {libraryPickFor !== null ? (
        <LibraryPickerDialog
          usedKeys={libraryKeysInOrder}
          clientId={customer.selectedClient?.id ?? null}
          clientName={
            customer.selectedClient
              ? customer.selectedClient.companyName || customer.selectedClient.personName || customer.selectedClient.phone
              : null
          }
          onClose={() => setLibraryPickFor(null)}
          onPick={pickFromLibrary}
        />
      ) : null}
      <StockItemPickerModal
        open={stockPicker !== null}
        onClose={() => setStockPicker(null)}
        items={stockEntries}
        initialCategory={stockPicker?.category ?? null}
        value={(() => {
          const row = stockPicker ? assignBySlot[stockPicker.slotId] : undefined;
          const st: RowMenuState | null = row ? slotMenuState(row) : null;
          return st?.kind === "stock" ? st.entry.id : null;
        })()}
        onPick={(id) => {
          if (!stockPicker) return;
          const slotId = stockPicker.slotId;
          guardSetRowChange(slotId, { productType: stockEntryDesigner(id), stockItem: true }, () => pickSlotStockItem(slotId, id));
        }}
        customerType={customer.customerType}
        t={t}
        locale={locale}
      />
      {giftSetDialog ? (
        <GiftSetDialog
          templates={giftSetTemplates}
          catalogs={giftSetCatalogs}
          customerType={dealerMode ? "dealer" : customer.customerType}
          allowManualPrice={!dealerMode}
          initial={giftSetDialog.initial}
          savedPrice={assignBySlot[giftSetDialog.slotId]?.giftSet?.savedPrice ?? null}
          reserved={giftSetReservedStock(
            slots.map((x) => {
              const row = assignBySlot[x.id];
              return {
                slotId: x.id,
                giftSet: row?.giftSet,
                variantId: row
                  ? (designerRowVariantId(row) ??
                    (row.productType === "uv_print" && row.uv?.source === "stock" ? row.uv.variantId : null) ??
                    (row.productType === "sublimation_print" && row.sublimation?.source === "stock" ? row.sublimation.variantId : null))
                  : null,
                quantity: row ? (parseAdminCopiesInput(row.copiesStr) ?? 0) : 0,
                saved: x.sourceOrderLineId != null,
              };
            }),
            giftSetTemplates,
            assignBySlot[giftSetDialog.slotId]?.giftSet?.groupId ?? null,
            savedSetHeldRef.current ?? undefined,
          )}
          boxStock={bootstrap.giftSetBoxStock}
          boxNames={bootstrap.giftSetBoxNames}
          boxImages={bootstrap.giftSetBoxImages}
          t={t}
          onClose={() => setGiftSetDialog(null)}
          onApply={(template, choice) => {
            applyGiftSet(giftSetDialog.slotId, template, choice);
            setGiftSetDialog(null);
          }}
        />
      ) : null}
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

type DealerQuoteState =
  | { status: "idle" | "loading" | "failed" }
  | {
      status: "ok";
      totalMdl: number | null;
      /** Lines only, without the urgency fee. */
      goodsTotalMdl: number | null;
      lineTotalsMdl: (number | null)[];
      urgency: DealerUrgencyQuote;
    };

/** Fee the order carries when the checkbox is on: the frozen one (already urgent) or today's rate. */
function dealerUrgencyFeeFor(urgency: DealerUrgencyQuote): number {
  if (urgency.state === "dealer" && urgency.orderFeeMdl != null) return urgency.orderFeeMdl;
  return urgency.feeMdl ?? 0;
}

/** «Набор» on the confirm step: the set header (first row of a set) and the item. */
interface ConfirmSetInfo {
  first: boolean;
  label: string;
  role: string;
  note: string | null;
  /** The set's box row (no file, «входит в набор»). */
  box?: boolean;
  /** Item name (or the box SKU) and its photo / colour. */
  item?: string;
  imageUrl?: string | null;
  swatch?: string | null;
  /** No photo: box / gift icon (stock row) or notebook / pen icon (ready set row) instead of the colour dot. */
  icon?: "box" | "gift" | "notebook" | "pen";
}

/** One row of the confirm table. */
interface ConfirmLine {
  id: string;
  name: string;
  product: string;
  copies: string;
  set?: ConfirmSetInfo;
}

function MultiConfirmStep({
  t,
  editing = false,
  customer,
  lines,
  dealerQuote = null,
  dealerUrgent = false,
  onDealerUrgentChange,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  /** Edit mode: the button says «Сохранить», not «Создать заказ». */
  editing?: boolean;
  customer: CustomerFormValue;
  lines: ConfirmLine[];
  /** Dealer mode: server price instead of the staff contact / price block. */
  dealerQuote?: DealerQuoteState | null;
  dealerUrgent?: boolean;
  onDealerUrgentChange?: (next: boolean) => void;
}) {
  const urgency = dealerQuote?.status === "ok" ? dealerQuote.urgency : null;
  const showUrgency = urgency != null && (urgency.available || urgency.state !== "off");
  const urgencyFee = urgency ? dealerUrgencyFeeFor(urgency) : 0;
  // Fee counted only for the dealer's own urgency (studio urgency is free).
  const feeInTotal = urgency && urgency.state !== "staff" && dealerUrgent ? urgencyFee : 0;
  const goodsTotal = dealerQuote?.status === "ok" ? dealerQuote.goodsTotalMdl : null;
  const shownTotal = goodsTotal != null ? Math.round((goodsTotal + feeInTotal) * 100) / 100 : null;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          {t.admin.newOrderPage.confirmTitle}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {editing ? t.admin.newOrderPage.confirmHintEdit : t.admin.newOrderPage.confirmHint}
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
              <Fragment key={row.id}>
                {row.set?.first ? (
                  // «Набор»: one header row per set, its items (and box) in one tinted group under it.
                  <tr className="border-b border-fuchsia-100 bg-fuchsia-50/70" data-testid="confirm-set-header">
                    <td colSpan={3} className="border-l-4 border-l-fuchsia-400 px-3 py-1.5">
                      <GiftSetBadge label={row.set.label} />
                    </td>
                  </tr>
                ) : null}
                <tr className={cn("border-b border-gray-100", row.set && "bg-fuchsia-50/30")} data-testid={row.set?.box ? "confirm-set-box" : undefined}>
                  <td className={cn("max-w-xs truncate px-3 py-2", row.set && "border-l-4 border-l-fuchsia-300 pl-4", row.set?.box && "text-gray-500")}>
                    {row.name}
                  </td>
                  <td className="px-3 py-2">
                    {row.set ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <GiftSetItemThumb imageUrl={row.set.imageUrl} swatch={row.set.swatch} alt={row.set.item ?? row.set.role} size="sm" icon={row.set.icon} />
                        <span className="min-w-0">
                          <span className="block">
                            {row.set.role ? <span className="text-fuchsia-800">{row.set.role} · </span> : null}
                            {row.set.box ? row.product : row.set.item ?? row.product}
                          </span>
                          <span className="mt-0.5 block">
                            <GiftSetBadge label={row.set.label} className="text-[10px]" />
                          </span>
                        </span>
                      </span>
                    ) : (
                      row.product
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.copies}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {dealerQuote ? (
        <dl className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">
              {t.cabinet.newOrder.wizardTotalTitle}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
              {dealerQuote.status === "ok" && shownTotal != null ? (
                formatAmountMdl(shownTotal, t.admin.currency)
              ) : dealerQuote.status === "ok" ? (
                (() => {
                  const known: number = dealerQuote.lineTotalsMdl.reduce<number>((sum, v) => sum + (v ?? 0), 0);
                  return known > 0
                    ? `${formatAmountMdl(known, t.admin.currency)} +`
                    : t.cabinet.newOrder.studioPricesLine;
                })()
              ) : dealerQuote.status === "failed" ? (
                "—"
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-normal text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t.cabinet.newOrder.wizardTotalLoading}
                </span>
              )}
            </dd>
            {dealerQuote.status === "ok" && shownTotal != null && feeInTotal > 0 && goodsTotal != null && (
              <p data-testid="dealer-quote-breakdown" className="mt-1 text-xs tabular-nums text-gray-500">
                {t.dealerUrgency.goodsLine} {formatAmountMdl(goodsTotal, t.admin.currency)} ·{" "}
                {t.dealerUrgency.feeLine} {t.dealerUrgency.feeShort(feeInTotal)}
              </p>
            )}
            {dealerQuote.status === "ok" && shownTotal == null && (
              <p className="mt-1 text-xs text-gray-500">{t.cabinet.newOrder.wizardTotalPartial}</p>
            )}
            {dealerQuote.status === "failed" && (
              <p className="mt-1 text-xs text-amber-800">{t.cabinet.newOrder.wizardTotalFailed}</p>
            )}
          </div>
          {showUrgency && urgency ? (
            <div data-testid="dealer-urgency-box">
              {urgency.state === "staff" ? (
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <Flame className="h-4 w-4" aria-hidden />
                  {t.dealerUrgency.staffSet}
                </p>
              ) : (
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                    dealerUrgent ? "border-red-300 bg-red-50/60" : "border-gray-200 hover:bg-gray-50",
                  )}
                >
                  <input
                    type="checkbox"
                    data-testid="dealer-urgent-checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                    checked={dealerUrgent}
                    onChange={(e) => onDealerUrgentChange?.(e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-gray-900">
                      <Flame className={cn("h-4 w-4", dealerUrgent ? "text-red-600" : "text-gray-400")} aria-hidden />
                      {t.dealerUrgency.checkboxLabel}
                      <span className="font-medium tabular-nums text-gray-600">
                        {t.dealerUrgency.feeShort(urgencyFee)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">{t.dealerUrgency.checkboxHint}</span>
                  </span>
                </label>
              )}
            </div>
          ) : null}
          {customer.notes && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">
                {t.cabinet.newOrder.wizardNotesTitle}
              </dt>
              <dd className="mt-1 text-sm whitespace-pre-line text-gray-800">
                {customer.notes}
              </dd>
            </div>
          )}
        </dl>
      ) : (
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
      )}
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
    fetch(props.audience === "dealer" ? "/api/cabinet/wizard-bootstrap" : "/api/admin/wizard-bootstrap")
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
  }, [props.audience]);

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
