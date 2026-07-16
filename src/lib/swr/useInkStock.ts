"use client";

import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { fetcher } from "./fetcher";

interface TankRow {
  printProcess: string;
  stockMl: number;
  avgCostPerMlMdl: number;
}

interface InkInventoryResponse {
  tanks?: TankRow[];
}

interface ReceiptRow {
  id: string;
  printProcess?: string;
  quantityMl: number;
  totalCostMdl: number;
  purchasedAt: string;
  note: string | null;
  createdBy: { id: string; name: string } | null;
}

export interface InkConsumptionRow {
  id: string;
  quantityMl: number;
  kind: string;
  orderId: string | null;
  orderNumber: number | null;
  inkCostMdl: number | null;
  inkSellPriceMdl: number | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

interface MovementsPage {
  items?: InkConsumptionRow[];
  total?: number;
  hasMore?: boolean;
}

const CONSUMPTION_PAGE_SIZE = 80;

export function useInkInventory() {
  const { data, error, isLoading, mutate } = useSWR<InkInventoryResponse>(
    "/api/admin/ink-inventory",
    fetcher,
    { dedupingInterval: 5000, revalidateOnFocus: false },
  );
  return {
    tanks: data?.tanks ?? null,
    error,
    isLoading,
    mutate,
  };
}

export function useInkReceipts(printProcess: string) {
  const params = new URLSearchParams({ printProcess });
  const { data, error, isLoading, mutate } = useSWR<{ items?: ReceiptRow[] }>(
    `/api/admin/ink-stock/receipts?${params}`,
    fetcher,
    { dedupingInterval: 5000, revalidateOnFocus: false },
  );
  return {
    receipts: data?.items ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useInkConsumption(printProcess: string) {
  const getKey = (
    pageIndex: number,
    previousPageData: MovementsPage | null,
  ) => {
    if (previousPageData && previousPageData.hasMore === false) return null;
    if (
      previousPageData &&
      pageIndex > 0 &&
      (previousPageData.items?.length ?? 0) === 0
    ) {
      return null;
    }
    const params = new URLSearchParams({
      printProcess,
      limit: String(CONSUMPTION_PAGE_SIZE),
      offset: String(pageIndex * CONSUMPTION_PAGE_SIZE),
    });
    return `/api/admin/ink-stock/movements?${params}`;
  };

  const { data, error, isLoading, isValidating, size, setSize, mutate } =
    useSWRInfinite<MovementsPage>(getKey, fetcher, {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
      revalidateFirstPage: true,
    });

  const consumption = data?.flatMap((page) => page.items ?? []) ?? [];
  const total = data?.[0]?.total ?? 0;
  const hasMore = data?.[data.length - 1]?.hasMore ?? false;

  return {
    consumption,
    total,
    hasMore,
    isLoading,
    isLoadingMore: Boolean(isValidating && data && size > data.length),
    loadMore: () => {
      if (!hasMore || isValidating) return;
      void setSize(size + 1);
    },
    error,
    mutate,
  };
}
