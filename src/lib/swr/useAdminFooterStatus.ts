"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { FooterStatusCounts } from "@/lib/studioInfo/footerStatus";

/** Shift counters for the admin footer; cheap COUNT queries, refreshed every minute. */
export function useAdminFooterStatus(enabled = true) {
  const { data } = useSWR<FooterStatusCounts>(enabled ? "/api/admin/footer-status" : null, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
  });
  return data ?? null;
}
