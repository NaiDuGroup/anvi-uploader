"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

interface ProductsResponse {
  items: unknown[];
}

export function usePublicMugProducts() {
  const { data, error, isLoading } = useSWR<ProductsResponse>(
    "/api/mug-products",
    fetcher,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  return {
    items: data?.items ?? [],
    error,
    isLoading,
  };
}

export function usePublicNotebookProducts() {
  const { data, error, isLoading } = useSWR<ProductsResponse>(
    "/api/notebook-products",
    fetcher,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  return {
    items: data?.items ?? [],
    error,
    isLoading,
  };
}

export type PublicLargeFormatSizePreset = {
  id: string;
  widthCm: number;
  heightCm: number;
  priceMdl: number;
};

export type PublicLargeFormatMaterial = {
  id: string;
  name: string;
  rollWidthMeters: number;
  printableWidthMeters: number;
  sellPricePerLinearMeter: number;
  sizePresets: PublicLargeFormatSizePreset[];
};

interface LargeFormatMaterialsResponse {
  items: PublicLargeFormatMaterial[];
  customerType: "retail" | "dealer";
}

export function usePublicLargeFormatMaterials() {
  const { data, error, isLoading } = useSWR<LargeFormatMaterialsResponse>(
    "/api/large-format-materials",
    fetcher,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  return {
    items: data?.items ?? [],
    customerType: data?.customerType ?? "retail",
    error,
    isLoading,
  };
}
