"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

export interface ClientRow {
  id: string;
  kind: string;
  phone: string | null;
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
  email: string | null;
  isDealer: boolean;
  userAccount: { id: string; name: string } | null;
  /** Non-deleted orders of the client. */
  ordersCount: number;
  /** Non-deleted unpaid orders (including ones without a price). */
  unpaidCount: number;
  /** Debt in MDL — same figure the client sees in the cabinet ("De plată"). */
  unpaidTotalMdl: number;
}

interface ClientsResponse {
  clients: ClientRow[];
  /** Rows matching the filters (all pages). */
  total?: number;
}

export function useClients(
  search: string,
  opts: { page?: number; pageSize?: number; debtorsOnly?: boolean } = {},
) {
  const params = new URLSearchParams();
  params.set("limit", String(opts.pageSize ?? 100));
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.debtorsOnly) params.set("debtors", "1");
  if (search) params.set("search", search);

  const { data, error, isLoading, mutate } = useSWR<ClientsResponse>(
    `/api/admin/clients?${params}`,
    fetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    },
  );

  return {
    clients: data?.clients ?? [],
    total: data?.total ?? data?.clients.length ?? 0,
    error,
    isLoading,
    mutate,
  };
}
