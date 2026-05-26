"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { SerializedCompanyProfile } from "@/lib/invoice/companyProfile";

interface CompanyProfileResponse {
  profile: SerializedCompanyProfile;
}

export function useCompanyProfile() {
  const { data, error, isLoading, mutate } = useSWR<CompanyProfileResponse>(
    "/api/admin/company-profile",
    fetcher,
    {
      dedupingInterval: 60000,
      revalidateOnFocus: false,
    },
  );

  return {
    companyProfile: data?.profile ?? null,
    error,
    isLoading,
    mutate,
  };
}
