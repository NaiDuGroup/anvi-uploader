import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type PenProduct = {
  id: string;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  stockQuantity: number;
  sellPrice: number | null;
  dealerPrice: number | null;
  purchaseCost: number | null;
  imageUrl: string | null;
  bodyColorHex: string;
  clipColorHex: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function usePenProducts() {
  const { data, error, isLoading, mutate } = useSWR<{ products: PenProduct[] }>(
    "/api/admin/pen-products",
    fetcher,
  );

  return {
    products: data?.products ?? [],
    isLoading,
    error,
    mutate,
  };
}
