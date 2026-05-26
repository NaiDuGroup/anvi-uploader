"use client";

import useSWR from "swr";
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

interface ConsumptionRow {
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
  const params = new URLSearchParams({ printProcess });
  const { data, error, isLoading, mutate } = useSWR<{ items?: ConsumptionRow[] }>(
    `/api/admin/ink-stock/movements?${params}`,
    fetcher,
    { dedupingInterval: 5000, revalidateOnFocus: false },
  );
  return {
    consumption: data?.items ?? [],
    error,
    isLoading,
    mutate,
  };
}
