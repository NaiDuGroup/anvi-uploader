import type { HistoryEntry } from "@/lib/orderHistoryFormat";
import type { WorkshopBoardFile, WorkshopBoardLine } from "./types";

/**
 * «Весь заказ» side panel on the workshop board
 * (`GET /api/workshop-board/order/[id]`).
 *
 * Money (`money`) is only sent to roles that may see it (`canSeeOrderMoney`);
 * for the workshop the field is absent and history entries about prices and
 * payments are dropped on the server.
 */
export interface WorkshopOrderOverview {
  order: {
    id: string;
    orderNumber: number;
    status: string;
    isPrio: boolean;
    phone: string;
    clientName: string | null;
    createdAt: string;
    notes: string | null;
    source: string;
    createdByName: string | null;
    sentToWorkshopByName: string | null;
    dealerUrgency: { feeMdl: number; waived: boolean } | null;
    dealerEditedAt: string | null;
    issueReason: string | null;
    commentCount: number;
    /** The edit wizard may open this order for this user (staff, not a storefront order). */
    canEdit: boolean;
    /** Only for super admin / studio admin. */
    money?: { priceMdl: number | null; isPaid: boolean };
  };
  lines: WorkshopOrderOverviewLine[];
  /** Newest first, at most `OVERVIEW_HISTORY_LIMIT`. */
  history: HistoryEntry[];
}

export interface WorkshopOrderOverviewLine {
  orderLineId: string;
  /** 1-based. */
  lineIndex: number;
  totalLines: number;
  productType: string;
  /** `OrderLine.productionStatus` (or the order status's line status for legacy rows). */
  lineStatus: string;
  /** The line as the board would show it; null when the board cannot describe it. */
  board: WorkshopBoardLine | null;
  files: WorkshopBoardFile[];
}
