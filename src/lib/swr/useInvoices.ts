"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { SerializedInvoice } from "@/lib/invoice/invoiceSerialization";

export interface InvoiceFilters {
  status?: string;
  query?: string;
  from?: string;
  to?: string;
  createdById?: string | null;
  clientId?: string;
  limit?: number;
}

function buildKey(filters: InvoiceFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.query?.trim()) params.set("q", filters.query.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.createdById) params.set("createdById", filters.createdById);
  if (filters.clientId) params.set("clientId", filters.clientId);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return `/api/admin/invoices${qs ? `?${qs}` : ""}`;
}

interface InvoicesResponse {
  invoices: SerializedInvoice[];
}

export function useInvoices(filters: InvoiceFilters) {
  const key = buildKey(filters);
  const { data, error, isLoading, isValidating, mutate } = useSWR<InvoicesResponse>(
    key,
    fetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    },
  );

  return {
    invoices: data?.invoices ?? null,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}
