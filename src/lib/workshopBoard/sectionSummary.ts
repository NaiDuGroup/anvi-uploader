import type { OrderStatus } from "@/lib/validations";
import { ORDER_STATUSES } from "@/lib/validations";
import type { BoardSectionKey, WorkshopBoardSection } from "./types";
import { boardLineStatus } from "@/lib/orderStatusFromLines";

/** How a product type's workload is measured on the board overview. */
export type VolumeUnit = "linear_meters" | "sheets" | "pieces";

export const VOLUME_UNIT_BY_TYPE: Record<BoardSectionKey, VolumeUnit> = {
  large_format_print: "linear_meters",
  business_card: "sheets",
  flyer: "sheets",
  mug: "pieces",
  notebook: "pieces",
  pen: "pieces",
  dtf_apparel: "pieces",
  uv_print: "pieces",
  // UV-DTF stickers are sold per linear metre of film.
  uv_dtf: "linear_meters",
  sublimation_print: "pieces",
  paper_print: "pieces",
};

/** Board statuses in pipeline order, as shown in the overview status bar. */
export const BOARD_STATUS_ORDER: readonly OrderStatus[] = [
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
];

export interface SectionVolume {
  unit: VolumeUnit;
  value: number;
}

export interface SectionSummary {
  /** Board section (product type, or «uv_dtf» for UV-DTF stickers). */
  key: BoardSectionKey;
  lineCount: number;
  /** Lines per line status (in order-status words, `boardLineStatus`); statuses with no lines are absent. */
  byStatus: Partial<Record<OrderStatus, number>>;
  volume: SectionVolume;
}

export interface BoardTotals {
  lineCount: number;
  byStatus: Partial<Record<OrderStatus, number>>;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(ORDER_STATUSES);

function isOrderStatus(value: string): value is OrderStatus {
  return KNOWN_STATUSES.has(value);
}

export function summarizeSection(section: WorkshopBoardSection): SectionSummary {
  const byStatus: Partial<Record<OrderStatus, number>> = {};
  let sheets = 0;
  for (const group of section.groups) {
    for (const line of group.lines) {
      // Each line counts under its own status (a waiting mug of an order whose
      // banner prints is «Ожидает», not «Печатается»).
      const st = boardLineStatus(line.status, line.lineStatus);
      if (isOrderStatus(st)) byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (line.facts.kind === "sheet_product") sheets += line.facts.data.sheetsUsed;
    }
  }

  const unit = VOLUME_UNIT_BY_TYPE[section.key];
  const value =
    unit === "linear_meters"
      ? (section.totals.totalLinearMeters ?? 0)
      : unit === "sheets"
        ? sheets
        : section.totals.totalQty;

  return {
    key: section.key,
    lineCount: section.totals.lineCount,
    byStatus,
    volume: { unit, value },
  };
}

export function summarizeBoard(summaries: readonly SectionSummary[]): BoardTotals {
  const byStatus: Partial<Record<OrderStatus, number>> = {};
  let lineCount = 0;
  for (const summary of summaries) {
    lineCount += summary.lineCount;
    for (const status of ORDER_STATUSES) {
      const n = summary.byStatus[status];
      if (n) byStatus[status] = (byStatus[status] ?? 0) + n;
    }
  }
  return { lineCount, byStatus };
}
