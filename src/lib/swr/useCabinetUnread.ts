"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

/** A live order of the customer with a «Нужен макет» line (oldest flag first). */
export interface CabinetLayoutIssueOrder {
  id: string;
  orderNumber: number;
  /** Flagged lines in the order. */
  lineCount: number;
  since: string | null;
}

interface CabinetUnreadResponse {
  totalUnread: number;
  layoutIssueOrders?: CabinetLayoutIssueOrder[];
}

/** SWR key of the cabinet shell poll — `mutate(CABINET_UNREAD_KEY)` refreshes the banner. */
export const CABINET_UNREAD_KEY = "/api/cabinet/unread";

const NO_LAYOUT_ISSUES: CabinetLayoutIssueOrder[] = [];

/**
 * Polls the total number of unread studio messages for the logged-in customer.
 * Drives the cabinet-wide unread badge + sound notification in `CabinetShell`,
 * and the «Нужен макет» banner / menu badge.
 */
export function useCabinetUnread() {
  const { data, mutate } = useSWR<CabinetUnreadResponse>(
    CABINET_UNREAD_KEY,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );

  return {
    totalUnread: data?.totalUnread ?? 0,
    /** Orders waiting for the customer's new layout (red banner + «Заказы» badge). */
    layoutIssueOrders: data?.layoutIssueOrders ?? NO_LAYOUT_ISSUES,
    mutate,
  };
}
