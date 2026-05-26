"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface ProductsResponse {
  items: unknown[];
}

export function usePublicMugProducts() {
  const { data, error, isLoading } = useSWR<ProductsResponse>(
    "/api/mug-products",
    fetcher,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  return {
    items: data?.items ?? [],
    error,
    isLoading,
  };
}

export function usePublicNotebookProducts() {
  const { data, error, isLoading } = useSWR<ProductsResponse>(
    "/api/notebook-products",
    fetcher,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  return {
    items: data?.items ?? [],
    error,
    isLoading,
  };
}
