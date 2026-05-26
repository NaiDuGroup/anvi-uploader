"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

export interface UserRow {
  id: string;
  name: string;
  displayName: string | null;
  role: string;
}

export function useUsers() {
  const { data, error, isLoading, mutate } = useSWR<UserRow[]>(
    "/api/admin/users",
    fetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    },
  );

  return {
    users: data ?? [],
    error,
    isLoading,
    mutate,
  };
}
