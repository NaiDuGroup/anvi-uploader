"use client";

import { create } from "zustand";

interface TrashOrderFile {
  id: string;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
}

interface TrashOrder {
  id: string;
  orderNumber: number;
  phone: string;
  status: string;
  clientName: string | null;
  clientId: string | null;
  studioClient: {
    id: string;
    kind: string;
    phone: string | null;
    personName: string | null;
    companyName: string | null;
    companyIdno: string | null;
  } | null;
  productType: string;
  isPrio: boolean;
  price: number | null;
  isPaid: boolean;
  createdAt: string;
  deletedAt: string;
  deletedByName: string | null;
  daysRemaining: number;
  files: TrashOrderFile[];
}

interface TrashState {
  orders: TrashOrder[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  totalCount: number;

  fetchTrash: (page?: number) => Promise<void>;
  restoreOrder: (id: string) => Promise<void>;
  permanentDeleteOrder: (id: string) => Promise<void>;
  setPage: (page: number) => void;
}

export const useTrashStore = create<TrashState>((set, get) => ({
  orders: [],
  loading: true,
  error: null,
  page: 1,
  totalPages: 1,
  totalCount: 0,

  fetchTrash: async (page?: number) => {
    const currentPage = page ?? get().page;
    set({ loading: true, error: null });

    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      const res = await fetch(`/api/orders/trash?${params}`);
      if (!res.ok) throw new Error("Failed to fetch trash");
      const data = await res.json();

      set({
        orders: data.orders,
        page: data.page,
        totalPages: data.totalPages,
        totalCount: data.totalCount,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },

  restoreOrder: async (id: string) => {
    const res = await fetch(`/api/orders/${id}/restore`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to restore order");
    await get().fetchTrash();
  },

  permanentDeleteOrder: async (id: string) => {
    const res = await fetch(`/api/orders/${id}/permanent`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to permanently delete order");
    await get().fetchTrash();
  },

  setPage: (page: number) => {
    set({ page });
    get().fetchTrash(page);
  },
}));
