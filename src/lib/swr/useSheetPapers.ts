"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { AdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";

interface SheetPapersResponse {
  items: AdminSheetPaperJson[];
}

export function useSheetPapers() {
  const { data, error, isLoading, mutate } = useSWR<SheetPapersResponse>(
    "/api/admin/sheet-papers",
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
