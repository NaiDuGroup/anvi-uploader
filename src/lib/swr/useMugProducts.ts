"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface MugProductsResponse {
  items: unknown[];
}

export function useMugProducts() {
  const { data, error, isLoading, mutate } = useSWR<MugProductsResponse>(
    "/api/admin/mug-products",
    fetcher,
    {
      dedupingInterval: 10000,
      revalidateOnFocus: false,
    },
  );

  return {
    items: data?.items ?? [],
    error,
    isLoading,
    mutate,
  };
}
