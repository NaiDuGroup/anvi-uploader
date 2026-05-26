"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { SerializedInvoice } from "@/lib/invoice/invoiceSerialization";

interface InvoiceDetailResponse {
  invoice: SerializedInvoice;
}

export function useInvoiceDetail(invoiceId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<InvoiceDetailResponse>(
    invoiceId ? `/api/admin/invoices/${invoiceId}` : null,
    fetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    },
  );

  return {
    invoice: data?.invoice ?? null,
    error,
    isLoading,
    mutate,
  };
}
