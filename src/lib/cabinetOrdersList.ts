import type { ClientVisibleStatus } from "@/lib/validations";

/**
 * Shared between `GET /api/cabinet/orders` and the cabinet orders list:
 * the status chips / status sort order and the sortable columns.
 */
export const CLIENT_VISIBLE_STATUSES: readonly ClientVisibleStatus[] = [
  "accepted",
  "queued",
  "printing",
  "readyInWorkshop",
  "readyInStudio",
  "delivered",
  "issue",
  "cancelled",
] as const;

/** Quick filter «Можно забрать»: ready at the workshop or at the studio. */
export const CABINET_PICKUP_FILTER = "pickup";
export const CABINET_PICKUP_STATUSES: readonly ClientVisibleStatus[] = ["readyInWorkshop", "readyInStudio"];

/** Value of the cabinet list's `status` filter: one status or the pickup quick filter. */
export type CabinetStatusFilter = ClientVisibleStatus | typeof CABINET_PICKUP_FILTER;

/**
 * Filter values sent by the cabinet before the statuses were split
 * (2026-11): a browser with the old page still open keeps working.
 */
const LEGACY_STATUS_FILTERS: Record<string, readonly ClientVisibleStatus[]> = {
  inProgress: ["accepted", "queued", "printing"],
  ready: ["delivered"],
};

/**
 * Client-visible statuses a `status` filter value covers; null for an empty
 * or unknown value (= no status filter).
 */
export function cabinetStatusFilterMembers(raw: string | null | undefined): readonly ClientVisibleStatus[] | null {
  if (!raw) return null;
  if (raw === CABINET_PICKUP_FILTER) return CABINET_PICKUP_STATUSES;
  if ((CLIENT_VISIBLE_STATUSES as readonly string[]).includes(raw)) return [raw as ClientVisibleStatus];
  return Object.hasOwn(LEGACY_STATUS_FILTERS, raw) ? LEGACY_STATUS_FILTERS[raw] : null;
}

export const CABINET_ORDER_SORTS = ["date", "number", "amount", "status"] as const;
export type CabinetOrderSort = (typeof CABINET_ORDER_SORTS)[number];

/** Direction a column starts in when first clicked. */
export const CABINET_ORDER_SORT_DEFAULT_DIR: Record<CabinetOrderSort, "asc" | "desc"> = {
  date: "desc",
  number: "desc",
  amount: "desc",
  status: "asc",
};
