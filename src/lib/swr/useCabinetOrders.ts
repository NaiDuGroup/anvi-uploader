"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface CabinetOrdersResponse {
  orders: unknown[];
}

export function useCabinetOrders() {
  const { data, error, isLoading, mutate } = useSWR<CabinetOrdersResponse>(
    "/api/cabinet/orders",
    fetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
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
    },
  );

  return {
    order: data ?? null,
    error,
    isLoading,
    mutate,
  };
}
