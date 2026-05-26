"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface LargeFormatMaterialsResponse {
  items: unknown[];
}

export function useLargeFormatMaterials() {
  const { data, error, isLoading, mutate } = useSWR<LargeFormatMaterialsResponse>(
    "/api/admin/large-format-materials",
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
