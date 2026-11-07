import type { StickerSheetPreviewData } from "@/lib/stickerSheet/stickerSheet";
import type { ProductType } from "@/lib/validations";
import type { LfRollOption } from "@/lib/largeFormat/lfRollChoice";
import type { DtfGarmentSource, DtfPlacement, GarmentKind } from "@/lib/dtf/dtfConstants";
import type { UvItemSource, UvPlacement } from "@/lib/uv/uvConstants";

// ─── File payload ──────────────────────────────────────────────────────────────

export interface WorkshopBoardFile {
  id: string;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
  orderLineId?: string | null;
}

// ─── Per-line summary facts ────────────────────────────────────────────────────

export interface LfLineFacts {
  materialName: string;
  rollWidthMeters: string | null;
  /** Explicit printable width override from materialSnapshot (meters string). */
  printableWidthMeters: string | null;
  widthCm: number;
  heightCm: number;
  quantity: number;
  /** Calculated linear meters consumed (from largeFormatLineData). */
  linearMeters: number;
  /** Banner finishing / roll-up set to do besides the print (Russian); omitted without extras. */
  extrasRu?: string;
}

export interface MugLineFacts {
  sku: string;
  displayName: string;
  imageUrl: string | null;
  bodyColorHex: string | null;
  handleColorHex: string | null;
  quantity: number;
}

export interface NotebookLineFacts {
  sku: string;
  displayName: string;
  imageUrl: string | null;
  coverColorHex: string | null;
  paperKind: string | null;
  quantity: number;
}

export interface PenLineFacts {
  sku: string;
  displayName: string;
  bodyColorHex: string | null;
  clipColorHex: string | null;
  quantity: number;
}

export interface PaperLineFacts {
  /** Dominant paper type (e.g. "A3", "A4") or "mixed" */
  paperType: string;
  /** Dominant color ("bw" | "color") or "mixed" */
  color: string;
  /**
   * Board name of the line (Russian): the storefront product with the format
   * («Календарь настольный на пружине · 21×14,8 см») or the format alone
   * («A4», «21×14,8 см» for a stored `other:21x14.8`).
   */
  label: string;
  quantity: number;
}

/** Business cards and flyers: one artwork imposed on a cut sheet. */
export interface SheetProductLineFacts {
  paperName: string;
  sheetWidthCm: number;
  sheetHeightCm: number;
  /** Card footprint on the sheet (trim + bleed). */
  cardWidthCm: number;
  cardHeightCm: number;
  /** Finished size after cutting — what the workshop cuts to. */
  cardTrimWidthCm: number;
  cardTrimHeightCm: number;
  /** Cards ordered (the run), not sheets. */
  quantity: number;
  cardsPerSheet: number;
  sheetsUsed: number;
  /** "one" / "two" printed sides. */
  sides: string;
  /** Storefront product and finishing in Russian («Приглашения · ламинация мат», «скруглённые углы»). */
  finishingRu?: string;
  /** Sticker sheets: what to print / cut and the sheet grid for the small preview. */
  sticker?: StickerSheetPreviewData & { summaryRu: string };
  /** Postcards: «Приглашение · A5 · A4+», workshop steps in order and the sheet preview. */
  postcard?: { summaryRu: string; stepsRu: string[]; preview: StickerSheetPreviewData };
}

/** One transfer printed per garment of a DTF line. */
export interface DtfTransferFacts {
  zoneId: string;
  placement: DtfPlacement;
  /** Free-text place of an «other» zone. */
  placementNote?: string;
  presetLabel: string;
  /** Operator-typed size; the preset label then names only the price class. */
  customSize: boolean;
  widthCm: number;
  heightCm: number;
  /** Artwork uploaded for this zone (`File.paperType = "dtf:<zoneId>"`); null when missing. */
  fileId: string | null;
  /** Dealer takes the baked transfer: print, do not press. */
  noPress?: boolean;
}

export interface DtfLineFacts {
  garmentSource: DtfGarmentSource;
  garmentKind: GarmentKind | null;
  garmentName: string | null;
  /** Item name in every UI language (absent on lines priced before 2026-11-05). */
  garmentNames?: { ro: string; ru: string; en: string } | null;
  colorName: string | null;
  colorHex: string | null;
  /** Total garments; every transfer is printed this many times. */
  quantity: number;
  sizes: { size: string; quantity: number }[];
  transfers: DtfTransferFacts[];
  filmLinearMeters: number;
}

/** One print zone of a UV line, printed on every piece. */
export interface UvZoneFacts {
  zoneId: string;
  placement: UvPlacement;
  /** Free-text place; shown instead of the placement name when set. */
  placementLabel: string | null;
  customSize: boolean;
  widthCm: number;
  heightCm: number;
  whiteLayers: number;
  varnish: boolean;
  primer: boolean;
  /** Artwork uploaded for this zone (`File.paperType = "uv:<zoneId>"`); null when missing. */
  fileId: string | null;
}

export interface UvLineFacts {
  source: UvItemSource;
  /** Stock item: variant id (groups the board card); null for client items. */
  variantId: string | null;
  /** Stock item name with its variant (Russian, like the other board labels). */
  itemName: string | null;
  sku: string | null;
  colorHex: string | null;
  /** Client item: what the client brought. */
  clientItemDescription: string | null;
  clientItemNotes: string | null;
  quantity: number;
  zones: UvZoneFacts[];
  /** UV-DTF: printed on film (A + B), laminated and stuck on / handed over as stickers. */
  transfer?: boolean;
  /** UV-DTF: film length for the line (m). */
  filmMeters?: number;
}

/** A sublimation line: a stock blank or the client's item printed on the Epson L1800. */
export interface SublimationLineFacts {
  /** Absent on facts built before client items = «stock». */
  source?: "stock" | "client";
  /** Stock blank; null for the client's item. */
  variantId: string | null;
  /** Blank name with its variant, or «изделие клиента: <описание>» (Russian, like the other board labels). */
  itemName: string;
  sku: string | null;
  colorHex: string | null;
  categoryCode: string | null;
  /** Client's item: print size («20×30 см») and note. */
  sizeLabel?: string | null;
  clientItemNotes?: string | null;
  quantity: number;
  /** Artwork files attached to the line. */
  fileCount: number;
}

/** Film the DTF printer runs on; all DTF lines are nested onto it together. */
export interface DtfFilmSpec {
  printableWidthCm: number;
  gapCm: number;
  /** Default gap between transfer outlines in the workshop layout (mm). */
  layoutGapMm?: number;
}

export type LineFacts =
  | { kind: "lf"; data: LfLineFacts }
  | { kind: "sheet_product"; data: SheetProductLineFacts }
  | { kind: "mug"; data: MugLineFacts }
  | { kind: "notebook"; data: NotebookLineFacts }
  | { kind: "pen"; data: PenLineFacts }
  | { kind: "dtf"; data: DtfLineFacts }
  | { kind: "uv"; data: UvLineFacts }
  | { kind: "sublimation"; data: SublimationLineFacts }
  | { kind: "paper"; data: PaperLineFacts };

// ─── Board line item ───────────────────────────────────────────────────────────

export interface WorkshopBoardLine {
  /** Unique: `{orderId}::{orderLineId}` */
  uid: string;
  orderId: string;
  orderLineId: string;
  orderNumber: number;
  /** 1-based index of this line within the order */
  lineIndex: number;
  /** Total lines in this order */
  totalLines: number;
  phone: string;
  clientName: string | null;
  /** The ORDER's status (derived from its lines in the workshop phase). */
  status: string;
  /**
   * This line's own production status (`OrderLine.productionStatus`:
   * WAITING / NEEDS_LAYOUT / PRINTING / DONE). Selection and display on the
   * board read this, via `boardLineStatus(status, lineStatus)`.
   */
  lineStatus: string;
  /**
   * «Нужен макет» (step 3): reason code, workshop comment and since when (ISO);
   * null unless `lineStatus` is NEEDS_LAYOUT. Production pickers skip such a
   * line (`isLineHeldForLayout`).
   */
  layoutIssue?: { reason: string | null; note: string | null; since: string | null } | null;
  /** Last replacement of a flagged line's file (ISO): «✓ Макет исправлен 14:20». */
  layoutFixedAt?: string | null;
  /** Step 4: the owner replaced the file of the waiting line (ISO) — «Файл заменён дилером 14:20». */
  ownerReplacedAt?: string | null;
  /** "dealer" | "client" — who replaced it. */
  ownerReplacedRole?: string | null;
  isPrio: boolean;
  /** Last dealer edit from the cabinet (ISO): «Изменён дилером …» on the card. */
  dealerEditedAt?: string | null;
  /** «срочно по заявке дилера · +50 лей» (null = no dealer request). */
  dealerUrgency?: { feeMdl: number; waived: boolean } | null;
  unreadCommentCount: number;
  commentCount: number;
  createdAt: string;
  productType: ProductType;
  facts: LineFacts;
  files: WorkshopBoardFile[];
  notes: string | null;
  createdByName: string | null;
  sentToWorkshopByName: string | null;
}

// ─── Aggregates ────────────────────────────────────────────────────────────────

export interface WorkshopBoardAggregate {
  lineCount: number;
  orderCount: number;
  /** Total pieces (mug/notebook copies, LF quantity, paper copies) */
  totalQty: number;
  /** LF only: sum of calculatedLinearMeters across all lines in group */
  totalLinearMeters?: number;
}

// ─── Group (by material/SKU) ───────────────────────────────────────────────────

/** Per-material line tally inside a family-grouped LF group. */
export interface LfMaterialBreakdownEntry {
  name: string;
  lineCount: number;
}

export interface WorkshopBoardGroupMeta {
  /** LF: roll width in meters (widest among the group's line snapshots). */
  rollWidthMeters?: string | null;
  /** LF: printable width override paired with `rollWidthMeters` (meters string). */
  printableWidthMeters?: string | null;
  /** LF: material family key (name without the trailing roll-size token). */
  familyKey?: string;
  /** LF: distinct ordered materials in this group with line counts. */
  materialBreakdown?: LfMaterialBreakdownEntry[];
  /** Mug/pen: body colour hex for visual indicator */
  bodyColorHex?: string | null;
  /** Mug: handle colour hex */
  handleColorHex?: string | null;
  /** Notebook: cover colour hex */
  coverColorHex?: string | null;
  /** Pen: clip colour hex */
  clipColorHex?: string | null;
  /** DTF: film used for the shared transfer layout. */
  dtfFilm?: DtfFilmSpec;
}

export interface WorkshopBoardGroup {
  /** Stable grouping key (material name, SKU, or paper combo) */
  key: string;
  /** Human-readable label shown in group header */
  label: string;
  aggregate: WorkshopBoardAggregate;
  lines: WorkshopBoardLine[];
  meta: WorkshopBoardGroupMeta;
}

// ─── Section (by product type) ─────────────────────────────────────────────────

/**
 * What a board section (overview tile, filter, collapsible block) is keyed by:
 * the product type, except that UV-DTF sticker lines (`uv_print` with
 * technique «transfer») get their own section apart from direct UV print.
 */
export type BoardSectionKey = ProductType | "uv_dtf";

export interface WorkshopBoardSection {
  /** Section identity; equals `productType` except for UV-DTF («uv_dtf»). */
  key: BoardSectionKey;
  productType: ProductType;
  groups: WorkshopBoardGroup[];
  totals: WorkshopBoardAggregate;
}

// ─── LF roll candidates (catalog rolls the workshop may print on) ──────────────

/**
 * An active LF catalog material enriched with its family key, so the client
 * can offer every roll of a family (e.g. ORACAL MATT 1.27 m / 1.62 m) as a
 * print target and compare layout costs via `evaluateLfRollOptions`.
 */
export interface LfRollCandidate extends LfRollOption {
  familyKey: string;
}

// ─── Top-level payload ─────────────────────────────────────────────────────────

export interface WorkshopBoardData {
  sections: WorkshopBoardSection[];
  /** Active LF materials for the layout roll picker (admin-only board). */
  lfRollCandidates: LfRollCandidate[];
  fetchedAt: string;
}

// ─── Section order ─────────────────────────────────────────────────────────────

export const SECTION_ORDER: readonly BoardSectionKey[] = [
  "large_format_print",
  "business_card",
  "flyer",
  "sticker_sheet",
  "postcard",
  "mug",
  "notebook",
  "pen",
  "dtf_apparel",
  "uv_print",
  "uv_dtf",
  "sublimation_print",
  "paper_print",
];

export function isBoardSectionKey(value: string): value is BoardSectionKey {
  return (SECTION_ORDER as readonly string[]).includes(value);
}
