"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface CabinetOrdersResponse {
  orders: unknown[];
}

/**
 * List poll interval (ms). Kept short (like the admin orders table) so the
 * per-row unread message badge and status changes surface quickly — clients
 * need to see *which* order got a studio reply, not just the global counter.
 */
const CABINET_LIST_POLL_INTERVAL_MS = 15_000;

/** Detail poll interval (ms) — the order detail also runs its own message thread poll. */
const CABINET_DETAIL_POLL_INTERVAL_MS = 120_000;

export function useCabinetOrders() {
  const { data, error, isLoading, mutate } = useSWR<CabinetOrdersResponse>(
    "/api/cabinet/orders",
    fetcher,
    {
      dedupingInterval: 5000,
      // Refresh on tab focus so switching back from another app shows the
      // latest unread badges immediately, not after the next poll tick.
      revalidateOnFocus: true,
      // Poll in the background (SWR pauses polling while the tab is hidden).
      refreshInterval: CABINET_LIST_POLL_INTERVAL_MS,
    },
  );

  return {
    orders: data?.orders ?? null,
    error,
    isLoading,
    mutate,
  };
}

export function useCabinetOrderDetail(orderId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    orderId ? `/api/cabinet/orders/${orderId}` : null,
    fetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
      refreshInterval: CABINET_DETAIL_POLL_INTERVAL_MS,
    },
  );

  return {
    order: data ?? null,
    error,
    isLoading,
    mutate,
  };
}
