"use client";

import { create } from "zustand";
import type { UpdateOrderInput, CreateAdminOrderInput, OrderStatus } from "@/lib/validations";

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
  sentToWorkshopBy: string | null;
  sentToWorkshopByName: string | null;
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

const PAGE_SIZE = 30;

interface OrdersState {
  orders: Order[];
  workshopOrders: Order[];
  loading: boolean;
  error: string | null;

  page: number;
  totalPages: number;
  totalCount: number;

  search: string;
  onlyMine: boolean;
  hideDelivered: boolean;
  statuses: OrderStatus[];
  dateFrom: string;
  dateTo: string;

  fetchOrders: (isPolling?: boolean) => Promise<void>;
  setPage: (page: number) => void;
  setSearch: (search: string) => void;
  setFilter: (key: "onlyMine" | "hideDelivered", value: boolean) => void;
  setStatusFilter: (statuses: OrderStatus[]) => void;
  setDateFilter: (dateFrom: string, dateTo: string) => void;
  updateOrder: (id: string, data: UpdateOrderInput) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  createAdminOrder: (data: CreateAdminOrderInput) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>((set, get) => {
  let fetchGen = 0;

  const initBool = (key: string): boolean =>
    typeof window !== "undefined" && localStorage.getItem(key) === "true";

  const initJson = <T>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
  };

  const initString = (key: string): string =>
    typeof window !== "undefined" ? (localStorage.getItem(key) ?? "") : "";

  return {
    orders: [],
    workshopOrders: [],
    loading: false,
    error: null,
    page: 1,
    totalPages: 1,
    totalCount: 0,
    search: "",
    onlyMine: initBool("admin-filter-mine"),
    hideDelivered: initBool("admin-filter-in-progress"),
    statuses: initJson<OrderStatus[]>("admin-filter-statuses", []),
    dateFrom: initString("admin-filter-date-from"),
    dateTo: initString("admin-filter-date-to"),

    fetchOrders: async (isPolling = false) => {
      if (!isPolling) fetchGen++;
      const gen = fetchGen;

      const { page, search, onlyMine, hideDelivered, statuses, dateFrom, dateTo } = get();
      if (!isPolling) {
        set({ loading: true, error: null });
      }

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));
        if (search) params.set("search", search);
        if (onlyMine) params.set("onlyMine", "true");
        if (hideDelivered) params.set("hideDelivered", "true");
        if (statuses.length > 0) params.set("statuses", statuses.join(","));
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const res = await fetch(`/api/orders?${params}`);
        if (!res.ok) throw new Error("Failed to fetch orders");

        if (fetchGen !== gen) return;

        const data = await res.json();

        if (
          data.orders.length === 0 &&
          data.totalCount > 0 &&
          data.page > data.totalPages
        ) {
          set({ page: data.totalPages });
          get().fetchOrders();
          return;
        }

        const prev = get();
        const ordersChanged =
          prev.orders.length !== data.orders.length ||
          JSON.stringify(prev.orders) !== JSON.stringify(data.orders);
        const wsChanged = data.workshopOrders !== undefined &&
          (prev.workshopOrders.length !== data.workshopOrders.length ||
            JSON.stringify(prev.workshopOrders) !== JSON.stringify(data.workshopOrders));
        const metaChanged =
          prev.totalCount !== data.totalCount ||
          prev.totalPages !== data.totalPages;

        if (ordersChanged || metaChanged || wsChanged) {
          const update: Partial<OrdersState> = {
            orders: data.orders,
            page: data.page,
            totalPages: data.totalPages,
            totalCount: data.totalCount,
            loading: false,
            error: null,
          };
          if (data.workshopOrders !== undefined) {
            update.workshopOrders = data.workshopOrders;
          }
          set(update as OrdersState);
        } else if (!isPolling) {
          set({ loading: false });
        }
      } catch (err) {
        if (fetchGen !== gen) return;
        if (!isPolling) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      }
    },

    setPage: (page: number) => {
      set({ page });
      get().fetchOrders();
    },

    setSearch: (search: string) => {
      if (search === get().search) return;
      set({ search, page: 1 });
      get().fetchOrders();
    },

    setFilter: (key: "onlyMine" | "hideDelivered", value: boolean) => {
      if (get()[key] === value) return;
      set({ [key]: value, page: 1 });
      localStorage.setItem(
        key === "onlyMine" ? "admin-filter-mine" : "admin-filter-in-progress",
        String(value),
      );
      get().fetchOrders();
    },

    setStatusFilter: (statuses: OrderStatus[]) => {
      set({ statuses, page: 1 });
      localStorage.setItem("admin-filter-statuses", JSON.stringify(statuses));
      get().fetchOrders();
    },

    setDateFilter: (dateFrom: string, dateTo: string) => {
      set({ dateFrom, dateTo, page: 1 });
      if (dateFrom) localStorage.setItem("admin-filter-date-from", dateFrom);
      else localStorage.removeItem("admin-filter-date-from");
      if (dateTo) localStorage.setItem("admin-filter-date-to", dateTo);
      else localStorage.removeItem("admin-filter-date-to");
      get().fetchOrders();
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
      set({ page: 1 });
      await get().fetchOrders();
    },
  };
});
