"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

export type SupplierKind = "transfers" | "commissions" | "all";

export interface SupplierRow {
  idno: string | null;
  name: string;
  count: number;
  total: string;
  firstPaymentDate: string;
  lastPaymentDate: string;
}

export interface SuppliersResponse {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  grandTotal: string;
  suppliers: SupplierRow[];
}

export interface SupplierFilters {
  query?: string;
  kind?: SupplierKind;
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
}

export function useSuppliers({
  query,
  kind = "transfers",
  page = 1,
  pageSize = 25,
  dateFrom,
  dateTo,
}: SupplierFilters = {}) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  params.set("kind", kind);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, error, isLoading, mutate } = useSWR<SuppliersResponse>(
    `/api/admin/suppliers?${params.toString()}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  return {
    suppliers: data?.suppliers ?? null,
    grandTotal: data?.grandTotal ?? "0",
    totalCount: data?.totalCount ?? 0,
    totalPages: data?.totalPages ?? 1,
    error,
    isLoading,
    mutate,
  };
}

export interface SupplierPayment {
  id: string;
  bookingDate: string;
  amount: string;
  currency: string;
  counterpartyName: string;
  purpose: string | null;
  documentNumber: string | null;
  txTypeCode: string | null;
}

export interface SupplierPaymentsResponse {
  total: string;
  count: number;
  payments: SupplierPayment[];
}

export function useSupplierPayments(
  target: { idno: string | null; name: string } | null,
  filters: { kind?: SupplierKind; dateFrom?: string; dateTo?: string } = {},
) {
  const params = new URLSearchParams();
  if (target?.idno) params.set("idno", target.idno);
  else if (target?.name) params.set("name", target.name);
  params.set("kind", filters.kind ?? "transfers");
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const key = target
    ? `/api/admin/suppliers/payments?${params.toString()}`
    : null;

  const { data, error, isLoading } = useSWR<SupplierPaymentsResponse>(
    key,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    payments: data?.payments ?? null,
    total: data?.total ?? "0",
    count: data?.count ?? 0,
    error,
    isLoading,
  };
}
