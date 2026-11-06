"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

export interface CabinetOrdersSummary {
  /** All of the customer's orders, ignoring filters. */
  allCount: number;
  totalDue: number;
  unpaidCount: number;
  /** Client-visible statuses that occur in the customer's orders. */
  statuses: string[];
  /** Orders waiting for the customer's new layout (all pages). */
  needsLayoutCount?: number;
}

export interface CabinetOrdersResponse {
  orders: unknown[];
  page: number;
  totalPages: number;
  /** Orders matching the filters (all pages). */
  totalCount: number;
  summary: CabinetOrdersSummary;
}

export interface CabinetOrdersQuery {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  dir?: "asc" | "desc";
}

/**
 * List poll interval (ms). Kept short (like the admin orders table) so the
 * per-row unread message badge and status changes surface quickly — clients
 * need to see *which* order got a studio reply, not just the global counter.
 */
const CABINET_LIST_POLL_INTERVAL_MS = 15_000;

/** Detail poll interval (ms) — the order detail also runs its own message thread poll. */
const CABINET_DETAIL_POLL_INTERVAL_MS = 120_000;

function cabinetOrdersKey(q: CabinetOrdersQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(q.page));
  params.set("limit", String(q.limit));
  if (q.search) params.set("search", q.search);
  if (q.status) params.set("status", q.status);
  if (q.dateFrom) params.set("dateFrom", q.dateFrom);
  if (q.dateTo) params.set("dateTo", q.dateTo);
  if (q.sort) params.set("sort", q.sort);
  if (q.dir) params.set("dir", q.dir);
  return `/api/cabinet/orders?${params}`;
}

/** One page of the customer's orders (server-side search / sort / pagination). */
export function useCabinetOrders(query: CabinetOrdersQuery) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<CabinetOrdersResponse>(
    cabinetOrdersKey(query),
    fetcher,
    {
      dedupingInterval: 5000,
      // Refresh on tab focus so switching back from another app shows the
      // latest unread badges immediately, not after the next poll tick.
      revalidateOnFocus: true,
      // Poll in the background (SWR pauses polling while the tab is hidden).
      refreshInterval: CABINET_LIST_POLL_INTERVAL_MS,
      // Keep the current page on screen while the next page / sort loads.
      keepPreviousData: true,
    },
  );

  return {
    data: data ?? null,
    error,
    isLoading,
    isValidating,
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
