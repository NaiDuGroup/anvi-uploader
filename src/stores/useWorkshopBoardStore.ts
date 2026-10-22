"use client";

import { startTransition } from "react";
import { create } from "zustand";
import type { WorkshopBoardData } from "@/lib/workshopBoard/types";
import { PRODUCT_TYPES, type ProductType } from "@/lib/validations";

export class WorkshopBoardFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WorkshopBoardFetchError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface WorkshopBoardFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  includeDelivered: boolean;
}

interface WorkshopBoardState {
  data: WorkshopBoardData | null;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number;

  filters: WorkshopBoardFilters;

  fetch: (isPolling?: boolean) => Promise<void>;
  setSearch: (search: string) => void;
  setDateFilter: (dateFrom: string, dateTo: string) => void;
  setIncludeDelivered: (value: boolean) => void;

  /** Product types picked on the overview tiles; empty shows every type. Client-side only. */
  activeTypes: ProductType[];
  setActiveTypes: (types: ProductType[]) => void;
}

const LS_BOARD_DATE_FROM = "wb-filter-date-from";
const LS_BOARD_DATE_TO = "wb-filter-date-to";
const LS_BOARD_INCLUDE_DELIVERED = "wb-filter-include-delivered";
const LS_BOARD_TYPES = "wb-filter-types";

function initString(key: string): string {
  return typeof window !== "undefined" ? (localStorage.getItem(key) ?? "") : "";
}

function initBool(key: string): boolean {
  return typeof window !== "undefined" && localStorage.getItem(key) === "true";
}

function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}

function initTypes(): ProductType[] {
  const raw = initString(LS_BOARD_TYPES);
  return raw ? raw.split(",").filter(isProductType) : [];
}

export const useWorkshopBoardStore = create<WorkshopBoardState>((set, get) => {
  let inFlight: AbortController | null = null;

  const buildUrl = (filters: WorkshopBoardFilters): string => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.includeDelivered) params.set("includeDelivered", "true");
    return `/api/orders/workshop-board?${params}`;
  };

  return {
    data: null,
    loading: true,
    error: null,
    lastFetchedAt: 0,

    filters: {
      search: "",
      dateFrom: initString(LS_BOARD_DATE_FROM),
      dateTo: initString(LS_BOARD_DATE_TO),
      includeDelivered: initBool(LS_BOARD_INCLUDE_DELIVERED),
    },

    activeTypes: initTypes(),

    fetch: async (isPolling = false) => {
      if (!isPolling) {
        if (inFlight) {
          inFlight.abort();
          inFlight = null;
        }
        set({ loading: true, error: null });
      }

      const controller = new AbortController();
      inFlight = controller;

      try {
        const url = buildUrl(get().filters);
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          throw new WorkshopBoardFetchError(
            `Failed to fetch workshop board (${res.status})`,
            res.status,
          );
        }

        const data = (await res.json()) as WorkshopBoardData;

        if (isPolling) {
          startTransition(() =>
            set({ data, loading: false, error: null, lastFetchedAt: Date.now() }),
          );
        } else {
          set({ data, loading: false, error: null, lastFetchedAt: Date.now() });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (!isPolling) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      } finally {
        if (inFlight === controller) {
          inFlight = null;
        }
      }
    },

    setSearch: (search: string) => {
      if (get().filters.search === search) return;
      set((s) => ({ filters: { ...s.filters, search } }));
      get().fetch().catch(() => {});
    },

    setDateFilter: (dateFrom: string, dateTo: string) => {
      set((s) => ({ filters: { ...s.filters, dateFrom, dateTo } }));
      if (dateFrom) localStorage.setItem(LS_BOARD_DATE_FROM, dateFrom);
      else localStorage.removeItem(LS_BOARD_DATE_FROM);
      if (dateTo) localStorage.setItem(LS_BOARD_DATE_TO, dateTo);
      else localStorage.removeItem(LS_BOARD_DATE_TO);
      get().fetch().catch(() => {});
    },

    setIncludeDelivered: (value: boolean) => {
      if (get().filters.includeDelivered === value) return;
      set((s) => ({ filters: { ...s.filters, includeDelivered: value } }));
      localStorage.setItem(LS_BOARD_INCLUDE_DELIVERED, String(value));
      get().fetch().catch(() => {});
    },

    setActiveTypes: (types: ProductType[]) => {
      set({ activeTypes: types });
      if (types.length > 0) localStorage.setItem(LS_BOARD_TYPES, types.join(","));
      else localStorage.removeItem(LS_BOARD_TYPES);
    },
  };
});
