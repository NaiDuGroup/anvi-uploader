import type { ClientVisibleStatus } from "@/lib/validations";

/**
 * Shared between `GET /api/cabinet/orders` and the cabinet orders list:
 * the status chips / status sort order and the sortable columns.
 */
export const CLIENT_VISIBLE_STATUSES: readonly ClientVisibleStatus[] = [
  "inProgress",
  "readyInWorkshop",
  "readyInStudio",
  "ready",
  "issue",
  "cancelled",
] as const;

export const CABINET_ORDER_SORTS = ["date", "number", "amount", "status"] as const;
export type CabinetOrderSort = (typeof CABINET_ORDER_SORTS)[number];

/** Direction a column starts in when first clicked. */
export const CABINET_ORDER_SORT_DEFAULT_DIR: Record<CabinetOrderSort, "asc" | "desc"> = {
  date: "desc",
  number: "desc",
  amount: "desc",
  status: "asc",
};
