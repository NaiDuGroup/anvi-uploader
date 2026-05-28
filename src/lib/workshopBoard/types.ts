import type { ProductType } from "@/lib/validations";

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

export interface PaperLineFacts {
  /** Dominant paper type (e.g. "A3", "A4") or "mixed" */
  paperType: string;
  /** Dominant color ("bw" | "color") or "mixed" */
  color: string;
  quantity: number;
}

export type LineFacts =
  | { kind: "lf"; data: LfLineFacts }
  | { kind: "mug"; data: MugLineFacts }
  | { kind: "notebook"; data: NotebookLineFacts }
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
  status: string;
  isPrio: boolean;
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

export interface WorkshopBoardGroupMeta {
  /** LF: roll width in meters (from materialSnapshot) */
  rollWidthMeters?: string | null;
  /** LF: explicit printable width override (meters string from materialSnapshot). */
  printableWidthMeters?: string | null;
  /** Mug: body colour hex for visual indicator */
  bodyColorHex?: string | null;
  /** Mug: handle colour hex */
  handleColorHex?: string | null;
  /** Notebook: cover colour hex */
  coverColorHex?: string | null;
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

export interface WorkshopBoardSection {
  productType: ProductType;
  groups: WorkshopBoardGroup[];
  totals: WorkshopBoardAggregate;
}

// ─── Top-level payload ─────────────────────────────────────────────────────────

export interface WorkshopBoardData {
  sections: WorkshopBoardSection[];
  fetchedAt: string;
}

// ─── Section order ─────────────────────────────────────────────────────────────

export const SECTION_ORDER: ProductType[] = [
  "large_format_print",
  "mug",
  "notebook",
  "paper_print",
];
