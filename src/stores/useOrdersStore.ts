"use client";

import { create } from "zustand";
import type { UpdateOrderInput, CreateAdminOrderInput } from "@/lib/validations";

interface OrderFile {
  id: string;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
}

interface Order {
  id: string;
  orderNumber: number;
  phone: string;
  status: string;
  notes: string | null;
  issueReason: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  clientName: string | null;
  isWorkshop: boolean;
  isPrio: boolean;
  publicToken: string;
  expiresAt: string;
  createdAt: string;
  files: OrderFile[];
  commentCount: number;
  unreadCommentCount: number;
}

interface OrdersState {
  orders: Order[];
  loading: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  updateOrder: (id: string, data: UpdateOrderInput) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  createAdminOrder: (data: CreateAdminOrderInput) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  loading: false,
  error: null,

  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      set({ orders: data, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },

  updateOrder: async (id: string, data: UpdateOrderInput) => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update order");
      await get().fetchOrders();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },

  deleteOrder: async (id: string) => {
    const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete order");
    await get().fetchOrders();
  },

  createAdminOrder: async (data: CreateAdminOrderInput) => {
    const res = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to create order");
    }
    await get().fetchOrders();
  },
}));
