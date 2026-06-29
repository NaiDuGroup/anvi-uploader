"use client";

import { startTransition } from "react";
import { create } from "zustand";
import {
  ORDER_STATUSES,
  type UpdateOrderInput,
  type CreateAdminOrderInput,
  type OrderStatus,
} from "@/lib/validations";
import {
  DEFAULT_ORDER_PAGE_SIZE,
  normalizeOrderPageLimit,
  type OrderPageSize,
} from "@/lib/orderPagination";

export class FetchOrdersError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "FetchOrdersError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface OrderFile {
  id: string;
  orderLineId?: string;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
}

interface OrderComment {
  id: string;
  text: string;
  createdAt: string;
  /** ISO timestamp set by PATCH /api/orders/[id]/comments/[commentId]; null for never-edited messages. */
  editedAt: string | null;
  userName: string;
  userRole: string;
  isOwn: boolean;
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
  clientId: string | null;
  productType: string;
  mugLayoutData: Record<string, unknown> | null;
  mugProductId: string | null;
  mugProductSnapshot: Record<string, unknown> | null;
  notebookLayoutData: Record<string, unknown> | null;
  notebookProductId: string | null;
  notebookProductSnapshot: Record<string, unknown> | null;
  approvalFeedback: string | null;
  isWorkshop: boolean;
  isPrio: boolean;
  price: number | null;
  isPaid: boolean;
  publicToken: string;
  expiresAt: string;
  createdAt: string;
  needsProcurement?: boolean;
  procurementMeta?: Record<string, unknown> | null;
  files: OrderFile[];
  commentCount: number;
  unreadCommentCount: number;
  /** Total messages in the separate client-facing channel. */
  clientMessageCount: number;
  /** Client (customer-authored) messages unread by the current staff user. */
  unreadClientMessageCount: number;
  comments: OrderComment[];
  /**
   * Issued-invoice line items pointing at this order. Drives the
   * "Cont N" badge in the admin orders table. Always present on
   * server payloads built by `fetchOrdersData` /
   * `fetchWorkshopSidebarData`; defaults to `[]` defensively for any
   * stale RSC cache from a pre-rollout build.
   */
  invoiceLinks?: Array<{
    id: string;
    invoice: { id: string; number: string | null };
  }>;
  orderLines?: Array<{
    id: string;
    sortOrder: number;
    productType: string;
    mugProductId: string | null;
    notebookProductId: string | null;
    mugLayoutData?: Record<string, unknown> | null;
    notebookLayoutData?: Record<string, unknown> | null;
    mugProductSnapshot: Record<string, unknown> | null;
    notebookProductSnapshot: Record<string, unknown> | null;
    largeFormatLineData?: unknown;
    files: OrderFile[];
  }>;
}

interface OrdersState {
  orders: Order[];
  workshopOrders: Order[];
  loading: boolean;
  error: string | null;

  page: number;
  pageSize: OrderPageSize;
  totalPages: number;
  totalCount: number;

  search: string;
  onlyMine: boolean;
  hideDelivered: boolean;
  needsProcurementOnly: boolean;
  statuses: OrderStatus[];
  dateFrom: string;
  dateTo: string;
  procurementTodayCount: number;
  lastFetchKey: string | null;
  lastFetchedAt: number;
  includeWorkshopOrders: boolean;

  hydrate: (data: {
    orders: Order[];
    workshopOrders?: Order[];
    page: number;
    totalPages: number;
    totalCount: number;
    procurementTodayCount?: number;
  }) => void;
  fetchOrders: (
    isPolling?: boolean,
    options?: { replaceList?: boolean },
  ) => Promise<{ id: string; name: string; role: string } | null>;
  fetchWorkshopSidebar: () => Promise<void>;
  setPage: (page: number) => void;
  setPageSize: (size: OrderPageSize) => void;
  setSearch: (search: string) => void;
  setFilter: (
    key: "onlyMine" | "hideDelivered" | "needsProcurementOnly",
    value: boolean,
  ) => void;
  setStatusFilter: (statuses: OrderStatus[]) => void;
  setDateFilter: (dateFrom: string, dateTo: string) => void;
  setIncludeWorkshopOrders: (value: boolean) => void;
  updateOrder: (id: string, data: UpdateOrderInput) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  createAdminOrder: (data: CreateAdminOrderInput) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>((set, get) => {
  let fetchGen = 0;
  let inFlight:
    | {
        key: string;
        controller: AbortController;
        promise: Promise<{ id: string; name: string; role: string } | null>;
      }
    | null = null;
  const buildFetchKey = (params: {
    page: number;
    pageSize: number;
    search: string;
    onlyMine: boolean;
    hideDelivered: boolean;
    needsProcurementOnly: boolean;
    statuses: OrderStatus[];
    dateFrom: string;
    dateTo: string;
    includeWorkshopOrders: boolean;
  }): string =>
    [
      params.page,
      params.pageSize,
      params.search,
      params.onlyMine ? 1 : 0,
      params.hideDelivered ? 1 : 0,
      params.needsProcurementOnly ? 1 : 0,
      params.statuses.join(","),
      params.dateFrom,
      params.dateTo,
      params.includeWorkshopOrders ? 1 : 0,
    ].join("|");

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

  const initPageSize = (): OrderPageSize =>
    typeof window !== "undefined"
      ? normalizeOrderPageLimit(localStorage.getItem("admin-orders-page-size"))
      : DEFAULT_ORDER_PAGE_SIZE;

  const validStatusSet = new Set<string>(ORDER_STATUSES);

  const initStatusesFilter = (): OrderStatus[] => {
    const parsed = initJson<OrderStatus[]>("admin-filter-statuses", []);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is OrderStatus => validStatusSet.has(s));
  };

  return {
    orders: [],
    workshopOrders: [],
    loading: true,
    error: null,
    page: 1,
    pageSize: initPageSize(),
    totalPages: 1,
    totalCount: 0,
    search: "",
    onlyMine: initBool("admin-filter-mine"),
    hideDelivered: initBool("admin-filter-in-progress"),
    needsProcurementOnly: initBool("admin-filter-procurement"),
    statuses: initStatusesFilter(),
    dateFrom: initString("admin-filter-date-from"),
    dateTo: initString("admin-filter-date-to"),
    procurementTodayCount: 0,
    lastFetchKey: null,
    lastFetchedAt: 0,
    includeWorkshopOrders: true,

    hydrate: (data) => {
      set({
        orders: data.orders,
        workshopOrders: data.workshopOrders ?? [],
        page: data.page,
        totalPages: data.totalPages,
        totalCount: data.totalCount,
        procurementTodayCount: data.procurementTodayCount ?? 0,
        lastFetchedAt: Date.now(),
        loading: false,
        error: null,
      });
    },

    fetchOrders: async (isPolling = false, options?: { replaceList?: boolean }) => {
      const replaceList = options?.replaceList === true;

      const {
        page,
        pageSize,
        search,
        onlyMine,
        hideDelivered,
        needsProcurementOnly,
        statuses,
        dateFrom,
        dateTo,
        includeWorkshopOrders,
      } = get();
      const requestKey = buildFetchKey({
        page,
        pageSize,
        search,
        onlyMine,
        hideDelivered,
        needsProcurementOnly,
        statuses,
        dateFrom,
        dateTo,
        includeWorkshopOrders,
      });

      if (inFlight && inFlight.key === requestKey) {
        return inFlight.promise;
      }

      if (!isPolling) {
        fetchGen++;
      }
      const gen = fetchGen;

      if (!isPolling && inFlight) {
        inFlight.controller.abort();
        inFlight = null;
      }

      const controller = new AbortController();

      if (!isPolling) {
        set({
          ...(replaceList ? { loading: true } : {}),
          error: null,
        });
      }
      let inFlightEntry: {
        key: string;
        controller: AbortController;
        promise: Promise<{ id: string; name: string; role: string } | null>;
      } | null = null;

      const requestPromise: Promise<{ id: string; name: string; role: string } | null> = (async () => {
        try {
          const params = new URLSearchParams();
          params.set("page", String(page));
          params.set("limit", String(pageSize));
          if (search) params.set("search", search);
          if (onlyMine) params.set("onlyMine", "true");
          if (hideDelivered) params.set("hideDelivered", "true");
          if (needsProcurementOnly) params.set("needsProcurement", "true");
          if (statuses.length > 0) params.set("statuses", statuses.join(","));
          if (dateFrom) params.set("dateFrom", dateFrom);
          if (dateTo) params.set("dateTo", dateTo);
          // Workshop sidebar is fetched separately via /api/orders/workshop-sidebar
          // on its own polling cadence — do not pay for it on every main-list refresh.
          params.set("includeWorkshop", "false");

          const res = await fetch(`/api/orders?${params}`, { signal: controller.signal });
          if (!res.ok) {
            throw new FetchOrdersError(
              `Failed to fetch orders (${res.status})`,
              res.status,
            );
          }

          if (fetchGen !== gen) return null;

          const data = await res.json();

          if (
            data.orders.length === 0 &&
            data.totalCount > 0 &&
            data.page > data.totalPages
          ) {
            set({ page: data.totalPages });
            return get().fetchOrders(false, { replaceList: true });
          }

          const prev = get();

          const orderFingerprint = (list: Order[]) =>
            list.map(
              (o) =>
                `${o.id}:${o.status}:${o.isPrio}:${o.assignedTo}:${o.isWorkshop}:${o.needsProcurement ? 1 : 0}:${o.commentCount}:${o.unreadCommentCount}:${o.notes}:${o.issueReason}:${o.price}:${o.isPaid}:${o.clientId ?? ""}`,
            ).join("|");

          const ordersChanged =
            prev.orders.length !== data.orders.length ||
            orderFingerprint(prev.orders) !== orderFingerprint(data.orders);
          const nextProcurement =
            typeof data.procurementTodayCount === "number" ? data.procurementTodayCount : 0;
          const metaChanged =
            prev.totalCount !== data.totalCount ||
            prev.totalPages !== data.totalPages ||
            prev.procurementTodayCount !== nextProcurement;

          if (ordersChanged || metaChanged) {
            const update: Partial<OrdersState> = {
              orders: data.orders,
              page: data.page,
              totalPages: data.totalPages,
              totalCount: data.totalCount,
              procurementTodayCount: nextProcurement,
              lastFetchKey: requestKey,
              lastFetchedAt: Date.now(),
              loading: false,
              error: null,
            };
            if (isPolling) {
              startTransition(() => set(update as OrdersState));
            } else {
              set(update as OrdersState);
            }
          } else if (!isPolling) {
            set({
              loading: false,
              lastFetchKey: requestKey,
              lastFetchedAt: Date.now(),
            });
          }

          return data.currentUser ?? null;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return null;
          }
          if (fetchGen !== gen) return null;
          if (!isPolling) {
            set({
              error: err instanceof Error ? err.message : "Unknown error",
              loading: false,
            });
          }
          throw err;
        } finally {
          if (inFlight === inFlightEntry) {
            inFlight = null;
          }
        }
      })();

      inFlightEntry = { key: requestKey, controller, promise: requestPromise };
      inFlight = inFlightEntry;
      return requestPromise;
    },

    fetchWorkshopSidebar: async () => {
      const {
        search,
        onlyMine,
        needsProcurementOnly,
        statuses,
        dateFrom,
        dateTo,
        includeWorkshopOrders,
      } = get();
      if (!includeWorkshopOrders) return;
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (onlyMine) params.set("onlyMine", "true");
      if (needsProcurementOnly) params.set("needsProcurement", "true");
      if (statuses.length > 0) params.set("statuses", statuses.join(","));
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      try {
        const res = await fetch(`/api/orders/workshop-sidebar?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as { workshopOrders: Order[] };
        if (!Array.isArray(data.workshopOrders)) return;

        const prev = get();
        const fp = (list: Order[]) =>
          list
            .map(
              (o) =>
                `${o.id}:${o.status}:${o.isPrio}:${o.assignedTo}:${o.commentCount}:${o.unreadCommentCount}:${o.notes}:${o.issueReason}:${o.price}:${o.isPaid}`,
            )
            .join("|");
        if (
          prev.workshopOrders.length !== data.workshopOrders.length ||
          fp(prev.workshopOrders) !== fp(data.workshopOrders)
        ) {
          startTransition(() => set({ workshopOrders: data.workshopOrders }));
        }
      } catch {
        // ignore — sidebar is best-effort
      }
    },

    setPage: (page: number) => {
      set({ page });
      get().fetchOrders(false, { replaceList: true });
    },

    setPageSize: (size: OrderPageSize) => {
      const next = normalizeOrderPageLimit(size);
      if (get().pageSize === next) return;
      set({ pageSize: next, page: 1 });
      localStorage.setItem("admin-orders-page-size", String(next));
      get().fetchOrders(false, { replaceList: true });
    },

    setSearch: (search: string) => {
      if (search === get().search) return;
      set({ search, page: 1 });
      get().fetchOrders(false, { replaceList: true });
    },

    setFilter: (key: "onlyMine" | "hideDelivered" | "needsProcurementOnly", value: boolean) => {
      if (get()[key] === value) return;
      set({ [key]: value, page: 1 });
      const lsKey =
        key === "onlyMine"
          ? "admin-filter-mine"
          : key === "hideDelivered"
            ? "admin-filter-in-progress"
            : "admin-filter-procurement";
      localStorage.setItem(lsKey, String(value));
      get().fetchOrders(false, { replaceList: true });
    },

    setStatusFilter: (statuses: OrderStatus[]) => {
      set({ statuses, page: 1 });
      localStorage.setItem("admin-filter-statuses", JSON.stringify(statuses));
      get().fetchOrders(false, { replaceList: true });
    },

    setDateFilter: (dateFrom: string, dateTo: string) => {
      set({ dateFrom, dateTo, page: 1 });
      if (dateFrom) localStorage.setItem("admin-filter-date-from", dateFrom);
      else localStorage.removeItem("admin-filter-date-from");
      if (dateTo) localStorage.setItem("admin-filter-date-to", dateTo);
      else localStorage.removeItem("admin-filter-date-to");
      get().fetchOrders(false, { replaceList: true });
    },

    setIncludeWorkshopOrders: (value: boolean) => {
      if (get().includeWorkshopOrders === value) return;
      set({
        includeWorkshopOrders: value,
        ...(value ? {} : { workshopOrders: [] }),
      });
      if (value) {
        get().fetchWorkshopSidebar().catch(() => {});
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
        await get().fetchOrders(true);
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    deleteOrder: async (id: string) => {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete order");
      await get().fetchOrders(true);
    },

    createAdminOrder: async (data: CreateAdminOrderInput) => {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        // Surface the technical reason to the browser console so the team
        // can read it from DevTools next time the wizard shows "Failed to
        // create order" — the visible toast/banner stays human-friendly.
        if (body.detail || body.error) {
          console.error(
            "[createAdminOrder] %s — %s",
            body.error ?? `HTTP ${res.status}`,
            body.detail ?? "(no detail)",
          );
        }
        throw new Error(body.error ?? "Failed to create order");
      }
      set({ page: 1 });
      await get().fetchOrders(false, { replaceList: true });
    },
  };
});
