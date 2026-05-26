"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface NotebookProductsResponse {
  items: unknown[];
}

export function useNotebookProducts() {
  const { data, error, isLoading, mutate } = useSWR<NotebookProductsResponse>(
    "/api/admin/notebook-products",
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
