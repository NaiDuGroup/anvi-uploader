"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface CabinetUnreadResponse {
  totalUnread: number;
}

/**
 * Polls the total number of unread studio messages for the logged-in customer.
 * Drives the cabinet-wide unread badge + sound notification in `CabinetShell`.
 */
export function useCabinetUnread() {
  const { data, mutate } = useSWR<CabinetUnreadResponse>(
    "/api/cabinet/unread",
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );

  return { totalUnread: data?.totalUnread ?? 0, mutate };
}
