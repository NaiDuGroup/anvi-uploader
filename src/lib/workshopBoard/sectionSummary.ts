import type { OrderStatus, ProductType } from "@/lib/validations";
import { ORDER_STATUSES } from "@/lib/validations";
import type { WorkshopBoardSection } from "./types";

/** How a product type's workload is measured on the board overview. */
export type VolumeUnit = "linear_meters" | "sheets" | "pieces";

export const VOLUME_UNIT_BY_TYPE: Record<ProductType, VolumeUnit> = {
  large_format_print: "linear_meters",
  business_card: "sheets",
  flyer: "sheets",
  mug: "pieces",
  notebook: "pieces",
  pen: "pieces",
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
  productType: ProductType;
  lineCount: number;
  /** Lines per status; statuses with no lines are absent. */
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
      if (isOrderStatus(line.status)) byStatus[line.status] = (byStatus[line.status] ?? 0) + 1;
      if (line.facts.kind === "sheet_product") sheets += line.facts.data.sheetsUsed;
    }
  }

  const unit = VOLUME_UNIT_BY_TYPE[section.productType];
  const value =
    unit === "linear_meters"
      ? (section.totals.totalLinearMeters ?? 0)
      : unit === "sheets"
        ? sheets
        : section.totals.totalQty;

  return {
    productType: section.productType,
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
