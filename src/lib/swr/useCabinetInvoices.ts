"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { SerializedInvoice } from "@/lib/invoice/invoiceSerialization";

interface CabinetInvoicesResponse {
  invoices: SerializedInvoice[];
}

export function useCabinetInvoices() {
  const { data, error, isLoading, mutate } = useSWR<CabinetInvoicesResponse>(
    "/api/cabinet/invoices",
    fetcher,
    {
      dedupingInterval: 10000,
      revalidateOnFocus: false,
    },
  );

  return {
    invoices: data?.invoices ?? null,
    error,
    isLoading,
    mutate,
  };
}
