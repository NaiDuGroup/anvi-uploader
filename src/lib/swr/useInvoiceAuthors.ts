"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { InvoiceAuthor } from "@/app/api/admin/invoice-authors/route";

interface AuthorsResponse {
  authors: InvoiceAuthor[];
}

export function useInvoiceAuthors() {
  const { data, error, isLoading } = useSWR<AuthorsResponse>(
    "/api/admin/invoice-authors",
    fetcher,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  return {
    authors: data?.authors ?? [],
    error,
    isLoading,
  };
}
