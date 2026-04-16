"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useCallback,
  memo,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileLightbox, FileThumb } from "@/components/FileLightbox";
import { playNotificationSound } from "@/lib/notificationSound";
import {
  RefreshCw,
  Search,
  UserCheck,
  AlertTriangle,
  Download,
  FileText,
  StickyNote,
  Palette,
  CircleOff,
  X,
  MessageCircle,
  Send,
  Plus,
  Trash2,
  User,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Flame,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  Info,
  CalendarDays,
  Filter,
  Banknote,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Link2,
} from "lucide-react";
import type { OrderStatus } from "@/lib/validations";
import { ORDER_STATUSES } from "@/lib/validations";
import {
  DEFAULT_ORDER_PAGE_SIZE,
  ORDER_PAGE_SIZE_OPTIONS,
} from "@/lib/orderPagination";
import type { OrderPageSize } from "@/lib/orderPagination";
import { formatPaperTypeLabel } from "@/lib/paperTypeLabel";
import { clientPickerLabel } from "@/lib/studioClient";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const CreateOrderModal = dynamic(() => import("./CreateOrderModal"), { ssr: false });
const EditOrderModal = dynamic(() => import("./EditOrderModal"), { ssr: false });
const IssueReasonModal = dynamic(() => import("./IssueReasonModal"), { ssr: false });
const CommentPanel = dynamic(() => import("./CommentPanel"), { ssr: false });
const DeleteConfirmModal = dynamic(() => import("./DeleteConfirmModal"), { ssr: false });
const HistoryPanel = dynamic(() => import("./HistoryPanel"), { ssr: false });

type AdminOrderSaving = { orderId: string; kind: "status" | "prio" | "paid" } | null;

function AdminOrderSearch({
  value,
  onChange,
  placeholder,
  clearLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("relative max-w-md", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden
      />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pl-10", value ? "pr-10" : undefined)}
        data-testid="admin-search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label={clearLabel}
          data-testid="admin-search-clear"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/** ~px per option row + vertical padding on the list panel */
function estimatePageSizeMenuHeight(optionCount: number): number {
  return optionCount * 36 + 10;
}

const OrdersPageSizeSelect = memo(function OrdersPageSizeSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: OrderPageSize;
  onChange: (size: OrderPageSize) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const computeOpenUpward = useCallback(() => {
    const wrap = wrapRef.current;
    const menu = menuRef.current;
    if (!wrap) return false;
    const rect = wrap.getBoundingClientRect();
    const gap = 8;
    const needed =
      menu?.offsetHeight ?? estimatePageSizeMenuHeight(ORDER_PAGE_SIZE_OPTIONS.length);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    if (spaceBelow >= needed) return false;
    if (spaceAbove >= needed) return true;
    return spaceAbove > spaceBelow;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    setOpenUpward(computeOpenUpward());
  }, [open, computeOpenUpward]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => setOpenUpward(computeOpenUpward());
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, computeOpenUpward]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const el = wrapRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const gap = 8;
      const needed = estimatePageSizeMenuHeight(ORDER_PAGE_SIZE_OPTIONS.length);
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const upward =
        spaceBelow < needed &&
        (spaceAbove >= needed || spaceAbove > spaceBelow);
      setOpenUpward(upward);
    }
    setOpen(true);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggleOpen}
        className={cn(
          "inline-flex items-center justify-between gap-2 min-w-[5.25rem] rounded-lg border border-gray-300 bg-white pl-2.5 pr-2 py-[7px] text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-50",
          !disabled && "cursor-pointer",
        )}
      >
        <span className="tabular-nums">{value}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-shrink-0 opacity-50 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && !disabled && (
        <div
          ref={menuRef}
          className={cn(
            "absolute right-0 z-50 min-w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg",
            openUpward ? "bottom-full mb-1" : "top-full mt-1",
          )}
          role="listbox"
          aria-label={ariaLabel}
        >
          {ORDER_PAGE_SIZE_OPTIONS.map((n) => {
            const active = n === value;
            return (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(n);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  active
                    ? "bg-amber-50 text-amber-900"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <span className="min-w-[1.75rem] tabular-nums font-medium">{n}</span>
                <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

function OrdersPaginationBar({
  page,
  pageSize,
  totalPages,
  totalCount,
  loading,
  t,
  setPage,
  setPageSize,
}: {
  page: number;
  pageSize: OrderPageSize;
  totalPages: number;
  totalCount: number;
  loading: boolean;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  setPage: (p: number) => void;
  setPageSize: (size: OrderPageSize) => void;
}) {
  if (totalCount <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-1">
      <span className="text-sm text-gray-500">
        {page} / {totalPages} ({totalCount})
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="whitespace-nowrap">{t.admin.rowsPerPage}</span>
          <OrdersPageSizeSelect
            value={pageSize}
            onChange={setPageSize}
            disabled={loading}
            ariaLabel={t.admin.rowsPerPage}
          />
        </label>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={loading || page <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums min-w-[3ch] text-center">{page}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_VARIANT_MAP: Record<OrderStatus, string> = {
  NEW: "info",
  IN_PROGRESS: "default",
  PENDING_APPROVAL: "cyan",
  CHANGES_REQUESTED: "pink",
  SENT_TO_WORKSHOP: "yellow",
  WORKSHOP_PRINTING: "orange",
  WORKSHOP_READY: "purple",
  RETURNED_TO_STUDIO: "indigo",
  DELIVERED: "success",
  ISSUE: "destructive",
};

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

interface InitialData {
  orders: Record<string, unknown>[];
  page: number;
  totalPages: number;
  totalCount: number;
  workshopOrders?: Record<string, unknown>[];
  currentUser: CurrentUser;
}

interface AdminPageClientProps {
  initialData: InitialData;
}

export default function AdminPage({ initialData }: AdminPageClientProps) {
  const orders = useOrdersStore((s) => s.orders);
  const workshopOrders = useOrdersStore((s) => s.workshopOrders);
  const loading = useOrdersStore((s) => s.loading);
  const page = useOrdersStore((s) => s.page);
  const pageSize = useOrdersStore((s) => s.pageSize);
  const totalPages = useOrdersStore((s) => s.totalPages);
  const totalCount = useOrdersStore((s) => s.totalCount);
  const onlyMine = useOrdersStore((s) => s.onlyMine);
  const hideDelivered = useOrdersStore((s) => s.hideDelivered);
  const selectedStatuses = useOrdersStore((s) => s.statuses);
  const dateFrom = useOrdersStore((s) => s.dateFrom);
  const dateTo = useOrdersStore((s) => s.dateTo);

  const hydrate = useOrdersStore((s) => s.hydrate);
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const updateOrder = useOrdersStore((s) => s.updateOrder);
  const deleteOrder = useOrdersStore((s) => s.deleteOrder);
  const rawSetPage = useOrdersStore((s) => s.setPage);
  const setPageSize = useOrdersStore((s) => s.setPageSize);
  const setSearch = useOrdersStore((s) => s.setSearch);
  const setFilter = useOrdersStore((s) => s.setFilter);
  const setStatusFilter = useOrdersStore((s) => s.setStatusFilter);
  const setDateFilter = useOrdersStore((s) => s.setDateFilter);

  const { t, locale } = useLanguageStore();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(
    () => useOrdersStore.getState().search,
  );

  const tableTopRef = useRef<HTMLDivElement>(null);
  const setPage = useCallback((p: number) => {
    rawSetPage(p);
    tableTopRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [rawSetPage]);
  const currentUser = initialData.currentUser;
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [commentOrderId, setCommentOrderId] = useState<string | null>(null);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [editingMugOrder, setEditingMugOrder] = useState<{
    orderId: string;
    mugLayoutData: Record<string, unknown>;
    phone?: string;
    clientName?: string | null;
    clientId?: string | null;
    studioClient?: { id: string; kind: string; phone: string | null; personName: string | null; companyName: string | null; companyIdno: string | null } | null;
    notes?: string | null;
    price?: number | null;
  } | null>(null);
  const [workshopOpen, setWorkshopOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("admin-workshop-panel") !== "closed";
    }
    return true;
  });

  const toggleWorkshopPanel = () => {
    setWorkshopOpen((prev) => {
      const next = !prev;
      localStorage.setItem("admin-workshop-panel", next ? "open" : "closed");
      return next;
    });
  };
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [orderSaving, setOrderSaving] = useState<AdminOrderSaving>(null);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const hasFilters =
      onlyMine || hideDelivered || selectedStatuses.length > 0 || dateFrom || dateTo;

    const savedPageSize = useOrdersStore.getState().pageSize;

    if (hasFilters || savedPageSize !== DEFAULT_ORDER_PAGE_SIZE) {
      fetchOrders(false, { replaceList: true }).catch(() => router.push("/admin/login"));
    } else {
      hydrate({
        orders: initialData.orders as never[],
        workshopOrders: initialData.workshopOrders as never[] | undefined,
        page: initialData.page,
        totalPages: initialData.totalPages,
        totalCount: initialData.totalCount,
      });
    }
  }, [hydrate, fetchOrders, initialData, onlyMine, hideDelivered, selectedStatuses, dateFrom, dateTo, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders(true).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (!value) setSearch("");
    },
    [setSearch],
  );

  useEffect(() => {
    if (!searchInput) return;
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput, setSearch]);

  const prevUnreadRef = useRef<number | null>(null);
  const [headerBounce, setHeaderBounce] = useState(false);
  const [toast, setToast] = useState<{ orderId: string; orderNumber: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalUnread = useMemo(
    () => orders.reduce((sum, o) => sum + o.unreadCommentCount, 0),
    [orders],
  );

  useEffect(() => {
    if (prevUnreadRef.current !== null && totalUnread > prevUnreadRef.current) {
      playNotificationSound();
      setHeaderBounce(true);
      setTimeout(() => setHeaderBounce(false), 2000);

      const unreadOrder = orders.find((o) => o.unreadCommentCount > 0);
      if (unreadOrder) {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ orderId: unreadOrder.id, orderNumber: unreadOrder.orderNumber });
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
      }
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread, orders]);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const scrollToFirstUnread = useCallback(() => {
    const firstUnread = orders.find((o) => o.unreadCommentCount > 0);
    if (!firstUnread) return;
    const row = document.querySelector(`tr[data-order-id="${firstUnread.id}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("ring-2", "ring-blue-400", "ring-offset-1");
      setTimeout(() => row.classList.remove("ring-2", "ring-blue-400", "ring-offset-1"), 2000);
    }
  }, [orders]);

  const isWorkshop = currentUser?.role === "workshop";
  const commentOrder = commentOrderId
    ? (orders.find((o) => o.id === commentOrderId)
      ?? workshopOrders.find((o) => o.id === commentOrderId)
      ?? null)
    : null;

  const handleStatusChange = useCallback(
    async (orderId: string, newStatus: string) => {
      if (newStatus === "ISSUE") {
        setIssueOrderId(orderId);
        return;
      }
      setOrderSaving({ orderId, kind: "status" });
      try {
        await updateOrder(orderId, { status: newStatus as OrderStatus });
      } finally {
        setOrderSaving(null);
      }
    },
    [updateOrder],
  );

  const handleConfirmIssue = async (reason: string) => {
    if (!issueOrderId) return;
    setOrderSaving({ orderId: issueOrderId, kind: "status" });
    try {
      await updateOrder(issueOrderId, { status: "ISSUE", issueReason: reason });
      setIssueOrderId(null);
    } finally {
      setOrderSaving(null);
    }
  };

  const handleTogglePrio = useCallback(
    async (orderId: string, currentPrio: boolean) => {
      setOrderSaving({ orderId, kind: "prio" });
      try {
        await updateOrder(orderId, { isPrio: !currentPrio });
      } finally {
        setOrderSaving(null);
      }
    },
    [updateOrder],
  );

  const handleTogglePaid = useCallback(
    async (orderId: string, currentPaid: boolean) => {
      setOrderSaving({ orderId, kind: "paid" });
      try {
        await updateOrder(orderId, { isPaid: !currentPaid });
      } finally {
        setOrderSaving(null);
      }
    },
    [updateOrder],
  );

  const handleDeleteOrder = async () => {
    if (!deleteOrderId) return;
    try {
      await deleteOrder(deleteOrderId);
    } catch { /* handled in store */ }
    setDeleteOrderId(null);
  };

  const editOrder = editOrderId
    ? orders.find((o) => o.id === editOrderId) ?? null
    : null;

  const handleEditMug = useCallback((orderId: string, mugLayoutData: Record<string, unknown>) => {
    setEditingMugOrder({ orderId, mugLayoutData });
  }, []);

  const handleEditOrder = useCallback((orderId: string) => {
    const order = [...orders, ...workshopOrders].find((o) => o.id === orderId);
    if (order?.productType === "mug") {
      const emptyLayout = {
        templateId: "text_photo",
        text: "",
        fontFamily: "Roboto",
        textColor: "#000000",
        backgroundColor: "transparent",
        photoUrls: [] as string[],
        photoSettings: [] as Array<{ fitMode: "cover" | "contain"; alignment: "left" | "center" | "right" }>,
      };
      setEditingMugOrder({
        orderId: order.id,
        mugLayoutData: (order.mugLayoutData as Record<string, unknown>) ?? emptyLayout,
        phone: order.phone,
        clientName: order.clientName,
        clientId: order.clientId,
        studioClient: order.studioClient,
        notes: order.notes,
        price: order.price,
      });
    } else {
      setEditOrderId(orderId);
    }
  }, [orders, workshopOrders]);

  const handleCopyApprovalLink = useCallback((publicToken: string) => {
    const link = `${window.location.origin}/approve/${publicToken}`;
    navigator.clipboard.writeText(link).catch(() => {});
  }, []);

  const pageTitle = isWorkshop ? t.admin.workshopTitle : t.admin.title;

  return (
    <>
      <main ref={tableTopRef} className="mx-auto max-w-[1600px] scroll-mt-[72px] px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">{pageTitle}</h1>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
            {!isWorkshop && (
              <Button size="sm" onClick={() => setShowCreateOrder(true)}>
                <Plus className="h-4 w-4" />
                {t.admin.newOrder}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOrders(false, { replaceList: true })}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t.common.refresh}
            </Button>
            {totalUnread > 0 && (
              <button
                type="button"
                onClick={scrollToFirstUnread}
                className={`flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-blue-700 hover:bg-blue-100 hover:border-blue-400 transition-colors cursor-pointer ${
                  headerBounce ? "animate-bounce" : "animate-pulse"
                }`}
                title={t.admin.unreadComments}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-sm font-bold">{totalUnread}</span>
              </button>
            )}
          </div>
        </div>
        {isWorkshop ? (
          /* ── Workshop: single full-width table ── */
          <>
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AdminOrderSearch
                  value={searchInput}
                  onChange={handleSearchChange}
                  placeholder={t.admin.searchPlaceholder}
                  clearLabel={t.admin.clearSearch}
                  className="flex-1 min-w-[200px]"
                />
                <StatusMultiSelect selected={selectedStatuses} onChange={setStatusFilter} isWorkshop t={t} />
                <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={setDateFilter} locale={locale} t={t} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideDelivered}
                    onChange={(e) => setFilter("hideDelivered", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-amber-500"
                  />
                  <span className="text-xs text-gray-500">{t.admin.filterInProgress}</span>
                </label>
              </div>
            </div>
            <OrderTable
              orders={orders}
              loading={loading}
              isWorkshop
              t={t}
              orderSaving={orderSaving}
              onStatusChange={handleStatusChange}
              onComment={setCommentOrderId}
              onHistory={setHistoryOrderId}
              onTogglePrio={handleTogglePrio}
              onTogglePaid={handleTogglePaid}
              onEdit={handleEditOrder}
              onDelete={setDeleteOrderId}
              onEditMug={handleEditMug}
              onCopyApprovalLink={handleCopyApprovalLink}
            />
            <OrdersPaginationBar
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              totalCount={totalCount}
              loading={loading}
              t={t}
              setPage={setPage}
              setPageSize={setPageSize}
            />
          </>
        ) : (
          /* ── Admin: two-column layout ── */
          <>
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AdminOrderSearch
                  value={searchInput}
                  onChange={handleSearchChange}
                  placeholder={t.admin.searchPlaceholder}
                  clearLabel={t.admin.clearSearch}
                  className="flex-1 min-w-[200px] max-w-md"
                />
                <StatusMultiSelect selected={selectedStatuses} onChange={setStatusFilter} isWorkshop={false} t={t} />
                <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={setDateFilter} locale={locale} t={t} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyMine}
                    onChange={(e) => setFilter("onlyMine", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-amber-500"
                  />
                  <span className="text-xs text-gray-500">{t.admin.filterMine}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideDelivered}
                    onChange={(e) => setFilter("hideDelivered", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-amber-500"
                  />
                  <span className="text-xs text-gray-500">{t.admin.filterInProgress}</span>
                </label>
              </div>
            </div>

            <div className="flex gap-5">
              {/* Left: all orders */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t.admin.filterAll}
                    <span className="ml-1.5 text-gray-400 normal-case tracking-normal font-normal">
                      ({totalCount})
                    </span>
                  </h2>
                  <button
                    type="button"
                    onClick={toggleWorkshopPanel}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-md hover:bg-gray-100"
                    title={workshopOpen ? t.admin.filterWorkshop : t.admin.filterWorkshop}
                  >
                    {workshopOpen ? (
                      <PanelRightClose className="w-4 h-4" />
                    ) : (
                      <>
                        <PanelRightOpen className="w-4 h-4" />
                        <span>{t.admin.filterWorkshop}</span>
                        {workshopOrders.length > 0 && (
                          <span className="bg-amber-100 text-amber-700 rounded-full px-1.5 text-[10px] font-bold">
                            {workshopOrders.length}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </div>
                <OrderTable
                  orders={orders}
                  loading={loading}
                  isWorkshop={false}
                  t={t}
                  orderSaving={orderSaving}
                  onStatusChange={handleStatusChange}
                  onComment={setCommentOrderId}
                  onHistory={setHistoryOrderId}
                  onTogglePrio={handleTogglePrio}
                  onTogglePaid={handleTogglePaid}
                  onEdit={handleEditOrder}
                  onDelete={setDeleteOrderId}
                  onEditMug={handleEditMug}
                  onCopyApprovalLink={handleCopyApprovalLink}
                />
                <OrdersPaginationBar
                  page={page}
                  pageSize={pageSize}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  loading={loading}
                  t={t}
                  setPage={setPage}
                  setPageSize={setPageSize}
                />
              </div>

              {/* Right: workshop sidebar (collapsible) */}
              {workshopOpen && (
                <div className="w-[340px] flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                        {t.admin.filterWorkshop}
                        <span className="ml-1.5 text-gray-400 normal-case tracking-normal font-normal">
                          ({workshopOrders.length})
                        </span>
                      </h2>
                      <span className="relative group">
                        <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 w-max max-w-[220px] rounded-md bg-gray-800 text-white text-[11px] leading-relaxed px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                          {t.admin.workshopSidebarHint}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={toggleWorkshopPanel}
                      className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <PanelRightClose className="w-4 h-4" />
                    </button>
                  </div>
                  <WorkshopSidebar
                    orders={workshopOrders}
                    t={t}
                    onComment={setCommentOrderId}
                    onTogglePrio={handleTogglePrio}
                    orderSaving={orderSaving}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {issueOrderId && (
        <IssueReasonModal
          t={t}
          isSubmitting={
            orderSaving?.orderId === issueOrderId &&
            orderSaving.kind === "status"
          }
          onConfirm={handleConfirmIssue}
          onClose={() => setIssueOrderId(null)}
        />
      )}

      {commentOrderId && commentOrder && (
        <CommentPanel
          orderId={commentOrderId}
          orderNumber={commentOrder.orderNumber}
          t={t}
          initialComments={commentOrder.comments}
          onClose={() => {
            setCommentOrderId(null);
            fetchOrders().catch(() => {});
          }}
        />
      )}

      {historyOrderId && (() => {
        const historyOrder = orders.find((o) => o.id === historyOrderId)
          ?? workshopOrders.find((o) => o.id === historyOrderId);
        return historyOrder ? (
          <HistoryPanel
            orderId={historyOrderId}
            orderNumber={historyOrder.orderNumber}
            t={t}
            onClose={() => setHistoryOrderId(null)}
          />
        ) : null;
      })()}

      {(showCreateOrder || editingMugOrder) && (
        <CreateOrderModal
          t={t}
          onClose={() => {
            setShowCreateOrder(false);
            setEditingMugOrder(null);
          }}
          onCreated={() => {
            setShowCreateOrder(false);
            setEditingMugOrder(null);
            fetchOrders().catch(() => {});
          }}
          editingMug={
            editingMugOrder
              ? {
                  orderId: editingMugOrder.orderId,
                  mugLayoutData: editingMugOrder.mugLayoutData as import("@/lib/validations").MugLayoutData,
                  phone: editingMugOrder.phone,
                  clientName: editingMugOrder.clientName,
                  clientId: editingMugOrder.clientId,
                  studioClient: editingMugOrder.studioClient,
                  notes: editingMugOrder.notes,
                  price: editingMugOrder.price,
                }
              : undefined
          }
        />
      )}

      {editOrderId && editOrder && (
        <EditOrderModal
          order={editOrder}
          t={t}
          onClose={() => setEditOrderId(null)}
          onSaved={() => {
            setEditOrderId(null);
            fetchOrders().catch(() => {});
          }}
        />
      )}

      {deleteOrderId && (
        <DeleteConfirmModal
          t={t}
          onConfirm={handleDeleteOrder}
          onClose={() => setDeleteOrderId(null)}
        />
      )}

      {toast && (
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3 shadow-lg">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <MessageCircle className="h-4 w-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {t.admin.newCommentToast}
            </p>
            <p className="text-xs text-gray-500">
              {t.admin.order} #{String(toast.orderNumber).padStart(4, "0")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const tid = toast.orderId;
              setToast(null);
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              setCommentOrderId(tid);
            }}
            className="ml-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {t.admin.viewComments}
          </button>
          <button
            type="button"
            onClick={() => {
              setToast(null);
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            }}
            className="ml-1 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

interface OrderTableProps {
  orders: ReturnType<typeof useOrdersStore.getState>["orders"];
  loading: boolean;
  isWorkshop: boolean;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  orderSaving: AdminOrderSaving;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onComment: (id: string) => void;
  onHistory: (id: string) => void;
  onTogglePrio: (id: string, current: boolean) => Promise<void>;
  onTogglePaid: (id: string, current: boolean) => Promise<void>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onEditMug: (orderId: string, mugLayoutData: Record<string, unknown>) => void;
  onCopyApprovalLink: (publicToken: string) => void;
}

/** From this many files, the list + specs collapse behind a toggle to keep table rows compact. */
const FILES_ACCORDION_MIN = 4;

function isExternalUrl(fileUrl: string): boolean {
  return fileUrl.startsWith("http://") || fileUrl.startsWith("https://");
}

const AdminOrderFilesCell = memo(function AdminOrderFilesCell({
  order,
  t,
  setLightboxFile,
}: {
  order: {
    id: string;
    productType: string;
    files: Array<{
      id: string;
      fileName: string;
      fileUrl: string;
      copies: number;
      color: string;
      paperType: string | null;
      pageCount: number | null;
    }>;
  };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  setLightboxFile: (f: { id: string; name: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const useAccordion = order.files.length >= FILES_ACCORDION_MIN;
  const showDetails = !useAccordion || expanded;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
        <span className="text-sm">{t.admin.filesCount(order.files.length)}</span>
        {order.files.length > 1 && (
          <a
            href={`/api/download/order/${order.id}`}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            {t.admin.downloadAll}
          </a>
        )}
        {useAccordion && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:text-gold-dark"
            aria-expanded={expanded}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
            />
            {expanded ? t.admin.filesHideList : t.admin.filesShowList(order.files.length)}
          </button>
        )}
      </div>
      {showDetails && (
        <>
          <OrderFileSpecs files={order.files} t={t} isMug={order.productType === "mug"} />
          <div className="text-xs text-gray-500 space-y-1 mt-1.5">
            {order.files.map((f) => {
              const isLink = isExternalUrl(f.fileUrl);
              return (
                <div key={f.id} className="flex items-center gap-1.5">
                  {isLink ? (
                    <div className="w-8 h-8 rounded bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                      <Link2 className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                  ) : (
                    <FileThumb
                      fileId={f.id}
                      fileName={f.fileName}
                      onClick={() => setLightboxFile({ id: f.id, name: f.fileName })}
                    />
                  )}
                  <div className="min-w-0 flex-1 max-w-[280px]">
                    {isLink ? (
                      <a
                        href={f.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline truncate block max-w-full text-left"
                        title={f.fileUrl}
                      >
                        {f.fileName}
                      </a>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setLightboxFile({ id: f.id, name: f.fileName })}
                          className="text-blue-600 hover:underline truncate block max-w-full text-left"
                          title={f.fileName}
                        >
                          {f.fileName}
                        </button>
                        {f.pageCount && (
                          <span className="text-gray-400">{t.admin.pagesCount(f.pageCount)}</span>
                        )}
                      </>
                    )}
                  </div>
                  {isLink ? (
                    <a
                      href={f.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600 flex-shrink-0 p-0.5"
                      title={t.upload.externalLink}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <a
                      href={`/api/download/${f.id}`}
                      className="text-gray-400 hover:text-blue-600 flex-shrink-0 p-0.5"
                      title="Download"
                    >
                      <Download className="w-3 h-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});

type SortColumn = "status" | null;
type SortDir = "asc" | "desc";

function SortableTh({
  col,
  current,
  dir,
  onSort,
  children,
}: {
  col: SortColumn;
  current: SortColumn;
  dir: SortDir;
  onSort: (col: SortColumn) => void;
  children: React.ReactNode;
}) {
  const active = current === col;
  return (
    <th
      className="px-3 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (
          dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

const STATUS_SORT_ORDER: Record<string, number> = {
  NEW: 0, IN_PROGRESS: 1, SENT_TO_WORKSHOP: 2, WORKSHOP_PRINTING: 3,
  WORKSHOP_READY: 4, RETURNED_TO_STUDIO: 5, DELIVERED: 6, ISSUE: 7,
};

const OrderTable = memo(function OrderTable({
  orders,
  loading,
  isWorkshop,
  t,
  orderSaving,
  onStatusChange,
  onComment,
  onHistory,
  onTogglePrio,
  onTogglePaid,
  onEdit,
  onDelete,
  onEditMug,
  onCopyApprovalLink,
}: OrderTableProps) {
  const [lightboxFile, setLightboxFile] = useState<{ id: string; name: string } | null>(null);
  const [sortCol, setSortCol] = useState<SortColumn>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback((col: SortColumn) => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }, [sortCol, sortDir]);

  const sortedOrders = useMemo(() => {
    if (!sortCol) return orders;
    const sorted = [...orders].sort((a, b) => {
      if (a.isPrio !== b.isPrio) return a.isPrio ? -1 : 1;
      const cmp = (STATUS_SORT_ORDER[a.status] ?? 99) - (STATUS_SORT_ORDER[b.status] ?? 99);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [orders, sortCol, sortDir]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 min-h-[280px] bg-white rounded-lg shadow">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" aria-hidden />
        <span className="text-sm text-gray-500">{t.common.loading}</span>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">
        {t.admin.noOrders}
      </div>
    );
  }

  return (
    <>
    {lightboxFile && (
      <FileLightbox
        fileId={lightboxFile.id}
        fileName={lightboxFile.name}
        onClose={() => setLightboxFile(null)}
      />
    )}
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            {isWorkshop ? (
              <>
                <col style={{ width: "11%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "29%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "19%" }} />
                <col style={{ width: "8%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "11%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "29%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "15%" }} />
              </>
            )}
          </colgroup>
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3">{t.admin.order}</th>
              <th className="px-3 py-3">{t.common.phone}</th>
              <th className="px-3 py-3">{t.common.files}</th>
              <th className="px-3 py-3">{t.common.createdBySentBy}</th>
              {isWorkshop ? (
                <SortableTh col="status" current={sortCol} dir={sortDir} onSort={toggleSort}>{t.common.status}</SortableTh>
              ) : (
                <th className="px-3 py-3">{t.common.status}</th>
              )}
              <th className="px-3 py-3">{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {sortedOrders.map((order) => (
              <React.Fragment key={order.id}>
              <tr
                data-order-id={order.id}
                className={`border-t border-gray-100 ${
                  order.isPrio
                    ? "bg-red-50/60 hover:bg-red-50 border-l-3 border-l-red-400"
                    : order.unreadCommentCount > 0
                      ? "unread-row border-l-4 border-l-blue-500 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.15)]"
                      : order.status === "DELIVERED"
                        ? "bg-green-50/40 opacity-60 hover:opacity-100 transition-opacity"
                        : "hover:bg-gray-50"
                }`}
              >
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {order.isPrio && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        <Flame className="w-3 h-3" />
                        {t.admin.prio}
                      </span>
                    )}
                    {!order.isPrio && order.unreadCommentCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide animate-pulse">
                        <MessageCircle className="w-3 h-3" />
                        {order.unreadCommentCount}
                      </span>
                    )}
                    <span className="font-mono text-sm font-semibold">
                      #{String(order.orderNumber).padStart(4, "0")}
                    </span>
                    {order.productType === "mug" && (
                      <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        {t.mug.productMug}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onComment(order.id)}
                      className={`relative p-1 rounded transition-colors ${
                        order.unreadCommentCount > 0
                          ? "hover:bg-blue-100 animate-bounce"
                          : "hover:bg-gray-100"
                      }`}
                      title={t.admin.comments}
                    >
                      <MessageCircle className={`w-4 h-4 ${
                        order.unreadCommentCount > 0 ? "text-blue-600" : "text-gray-400"
                      }`} />
                      {order.commentCount > 0 && (
                        <span className={`absolute -top-1 -right-1 text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${
                          order.unreadCommentCount > 0
                            ? "bg-red-500 text-white animate-pulse"
                            : "bg-gray-200 text-gray-600"
                        }`}>
                          {order.unreadCommentCount > 0 ? order.unreadCommentCount : order.commentCount}
                        </span>
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-3 align-middle text-sm overflow-hidden">
                  {isWorkshop ? (
                    <a href={`tel:${order.phone}`} className="font-medium text-blue-600 hover:underline">
                      {order.phone}
                    </a>
                  ) : (
                    <span>{order.phone}</span>
                  )}
                  {order.clientName && (
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {order.clientName}
                    </p>
                  )}
                  {order.studioClient && (
                    <p className="mt-0.5 text-xs text-amber-800">
                      {t.admin.orderStudioClient}: {clientPickerLabel(order.studioClient)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1 tabular-nums">
                    {new Date(order.createdAt).toLocaleString()}
                  </p>
                  {!isWorkshop ? (
                    <button
                      type="button"
                      onClick={() => onTogglePaid(order.id, order.isPaid)}
                      disabled={
                        orderSaving?.orderId === order.id &&
                        orderSaving.kind === "paid"
                      }
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-60 disabled:cursor-wait",
                        order.isPaid
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-red-100 text-red-600 hover:bg-red-200",
                      )}
                      title={
                        order.isPaid ? t.admin.markUnpaid : t.admin.markPaid
                      }
                    >
                      {orderSaving?.orderId === order.id &&
                      orderSaving.kind === "paid" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Banknote className="h-3 w-3" />
                      )}
                      {order.price != null ? (
                        <span className="tabular-nums">{order.price} {t.admin.currency}</span>
                      ) : (
                        <>{order.isPaid ? t.admin.paid : t.admin.unpaid}</>
                      )}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        order.isPaid
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600",
                      )}
                    >
                      <Banknote className="h-3 w-3" />
                      {order.price != null ? (
                        <span className="tabular-nums">{order.price} {t.admin.currency}</span>
                      ) : (
                        <>{order.isPaid ? t.admin.paid : t.admin.unpaid}</>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 align-middle overflow-hidden">
                  <AdminOrderFilesCell order={order} t={t} setLightboxFile={setLightboxFile} />
                </td>
                <td className="px-3 py-3 align-middle text-xs text-gray-500 overflow-hidden">
                  <p className="flex items-center gap-1 truncate" title={order.createdByName ?? t.common.createdByClient}>
                    <UserCheck className="w-3 h-3 flex-shrink-0 text-gray-400" />
                    {order.createdByName ?? (
                      <span className="text-gray-400">{t.common.createdByClient}</span>
                    )}
                  </p>
                  {(order.sentToWorkshopByName || order.isWorkshop) && (
                    <p className="flex items-center gap-1 truncate mt-0.5" title={order.sentToWorkshopByName ?? order.createdByName ?? ""}>
                      <Send className="w-3 h-3 flex-shrink-0 text-gray-400" />
                      {order.sentToWorkshopByName ?? order.createdByName ?? "—"}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 align-middle overflow-hidden">
                  <div className="flex min-w-0 flex-col gap-1">
                    <StatusDropdown
                      order={order}
                      t={t}
                      isWorkshop={isWorkshop}
                      onStatusChange={onStatusChange}
                      statusTriggerTestScope="table"
                      isSaving={
                        orderSaving?.orderId === order.id && orderSaving.kind === "status"
                      }
                    />
                    {order.assignedToName && (
                      <p className="flex items-start gap-1 text-xs leading-snug text-gray-500">
                        <UserCheck className="mt-0.5 h-3 w-3 flex-shrink-0" />
                        <span className="min-w-0 break-words">
                          {t.common.statusChangedBy}:{" "}
                          <span className="font-medium text-gray-600">{order.assignedToName}</span>
                        </span>
                      </p>
                    )}
                    {order.status === "ISSUE" && order.issueReason && (
                      <p className="flex max-w-full items-start gap-1 text-xs leading-snug text-red-600">
                        <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                        <span className="min-w-0 break-words">{order.issueReason}</span>
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center gap-0.5">
                    {!isWorkshop && (
                      <button
                        type="button"
                        onClick={() => onTogglePrio(order.id, order.isPrio)}
                        disabled={
                          orderSaving?.orderId === order.id && orderSaving.kind === "prio"
                        }
                        className={`p-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-wait ${
                          order.isPrio
                            ? "text-red-500 bg-red-50 hover:bg-red-100"
                            : "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                        }`}
                        title={order.isPrio ? t.admin.prioOff : t.admin.prioOn}
                      >
                        {orderSaving?.orderId === order.id && orderSaving.kind === "prio" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Flame className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onHistory(order.id)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      title={t.admin.history}
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    {!isWorkshop && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(order.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title={t.admin.editOrder}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(order.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title={t.admin.deleteOrder}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              {order.notes && (
                <tr className={
                  order.isPrio
                    ? "bg-red-50/60"
                    : order.unreadCommentCount > 0
                      ? "unread-row"
                      : order.status === "DELIVERED"
                        ? "bg-green-50/40 opacity-60"
                        : ""
                }>
                  <td colSpan={6} className="px-4 pb-2.5 pt-0">
                    <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                      <StickyNote className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{order.notes}</p>
                    </div>
                  </td>
                </tr>
              )}
              {order.productType === "mug" && (order.approvalFeedback || order.status === "PENDING_APPROVAL" || order.status === "CHANGES_REQUESTED") && (
                <tr className={order.isPrio ? "bg-red-50/60" : ""}>
                  <td colSpan={6} className="px-4 pb-2.5 pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {order.status === "PENDING_APPROVAL" && (
                        <button
                          type="button"
                          onClick={() => onCopyApprovalLink(order.publicToken)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 text-violet-700 px-2.5 py-1.5 text-xs font-medium hover:bg-violet-100 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {t.approve.copyApprovalLink}
                        </button>
                      )}
                      {order.status === "CHANGES_REQUESTED" && order.mugLayoutData && (
                        <button
                          type="button"
                          onClick={() => onEditMug(order.id, order.mugLayoutData as Record<string, unknown>)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2.5 py-1.5 text-xs font-medium hover:bg-amber-100 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {t.approve.editMugLayout}
                        </button>
                      )}
                      {order.approvalFeedback && (
                        <div className="flex-1 min-w-[200px] bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{t.approve.clientFeedback}</p>
                          <p className="text-xs text-amber-900">{order.approvalFeedback}</p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
});

const WorkshopSidebar = memo(function WorkshopSidebar({
  orders,
  t,
  onComment,
  onTogglePrio,
  orderSaving,
}: {
  orders: ReturnType<typeof useOrdersStore.getState>["orders"];
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onComment: (id: string) => void;
  onTogglePrio: (id: string, current: boolean) => Promise<void>;
  orderSaving: AdminOrderSaving;
}) {
  const [lightboxFile, setLightboxFile] = useState<{ id: string; name: string } | null>(null);

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 bg-white rounded-lg shadow text-sm">
        {t.admin.noOrders}
      </div>
    );
  }

  return (
    <>
    {lightboxFile && (
      <FileLightbox
        fileId={lightboxFile.id}
        fileName={lightboxFile.name}
        onClose={() => setLightboxFile(null)}
      />
    )}
    <div className="space-y-2">
      {orders.map((order) => (
        <div
          key={order.id}
          data-order-id={order.id}
          className={`rounded-lg border p-3 transition-colors shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] ${
            order.isPrio
              ? "border-red-200 bg-red-50/70"
              : order.unreadCommentCount > 0
                ? "border-blue-300 unread-row"
                : order.status === "DELIVERED"
                  ? "border-green-200 bg-green-50/40 opacity-60 hover:opacity-100"
                  : "border-gray-200 bg-white hover:bg-gray-50/50"
          }`}
        >
          {/* Row 1: order number + prio + comments */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {order.isPrio && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  <Flame className="w-3 h-3" />
                  {t.admin.prio}
                </span>
              )}
              <span className="font-mono text-sm font-semibold">
                #{String(order.orderNumber).padStart(4, "0")}
              </span>
              {order.productType === "mug" && (
                <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {t.mug.productMug}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onTogglePrio(order.id, order.isPrio)}
                disabled={
                  orderSaving?.orderId === order.id && orderSaving.kind === "prio"
                }
                className={`p-1 rounded transition-colors disabled:opacity-60 disabled:cursor-wait ${
                  order.isPrio
                    ? "text-red-500 hover:bg-red-100"
                    : "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                }`}
                title={order.isPrio ? t.admin.prioOff : t.admin.prioOn}
              >
                {orderSaving?.orderId === order.id && orderSaving.kind === "prio" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Flame className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onComment(order.id)}
                className={`relative p-1 rounded transition-colors ${
                  order.unreadCommentCount > 0
                    ? "hover:bg-blue-100 animate-bounce"
                    : "hover:bg-gray-100"
                }`}
                title={t.admin.comments}
              >
                <MessageCircle className={`w-4 h-4 ${
                  order.unreadCommentCount > 0 ? "text-blue-600" : "text-gray-400"
                }`} />
                {order.commentCount > 0 && (
                  <span className={`absolute -top-1 -right-1 text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${
                    order.unreadCommentCount > 0
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-gray-200 text-gray-600"
                  }`}>
                    {order.unreadCommentCount > 0 ? order.unreadCommentCount : order.commentCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: status + price + paid */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              TRIGGER_COLORS[STATUS_VARIANT_MAP[order.status as OrderStatus] ?? "outline"]
            }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[order.status] ?? "bg-gray-400"}`} />
              {t.statuses[order.status as OrderStatus] ?? order.status}
            </span>
            {order.price != null && (
              <span className="text-xs font-medium tabular-nums text-gray-600">
                {order.price} {t.admin.currency}
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                order.isPaid
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-600",
              )}
            >
              <Banknote className="h-3 w-3" />
              {order.isPaid ? t.admin.paid : t.admin.unpaid}
            </span>
          </div>

          {/* Row 3: creator/sender + file info */}
          <div className="text-xs text-gray-500 space-y-0.5">
            <p className="flex items-center gap-1">
              <UserCheck className="w-3 h-3 flex-shrink-0" />
              {order.createdByName ?? (
                <span className="text-gray-400">{t.common.createdByClient}</span>
              )}
              {" / "}
              <span className="inline-flex items-center gap-1">
                <Send className="w-3 h-3 flex-shrink-0" />
                {order.sentToWorkshopByName ?? order.createdByName ?? "—"}
              </span>
            </p>
            <p className="flex items-center gap-1">
              {t.admin.filesCount(order.files.length)}
              {order.productType !== "mug" && order.files[0]?.paperType && (
                <span className="text-gray-400">
                  · {formatPaperTypeLabel(order.files[0].paperType, t.upload)}
                </span>
              )}
              {order.productType !== "mug" && order.files[0] && (
                <span className="text-gray-400">
                  · {order.files[0].color === "color" ? t.admin.color : t.admin.bw}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {order.files.slice(0, 4).map((f) => (
                <FileThumb
                  key={f.id}
                  fileId={f.id}
                  fileName={f.fileName}
                  onClick={() => setLightboxFile({ id: f.id, name: f.fileName })}
                />
              ))}
              {order.files.length > 4 && (
                <button
                  type="button"
                  onClick={() => setLightboxFile({ id: order.files[4].id, name: order.files[4].fileName })}
                  className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0"
                >
                  +{order.files.length - 4}
                </button>
              )}
            </div>
            {order.notes && (
              <p className="flex items-start gap-1 line-clamp-2" title={order.notes}>
                <StickyNote className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                {order.notes}
              </p>
            )}
            {order.productType === "mug" && order.approvalFeedback && (
              <div className="mt-1 bg-amber-50 border border-amber-200 rounded-md p-2">
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">{t.approve.clientFeedback}</p>
                <p className="text-xs text-amber-900">{order.approvalFeedback}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
    </>
  );
});

const ADMIN_STATUSES: OrderStatus[] = [
  "NEW", "IN_PROGRESS", "PENDING_APPROVAL", "CHANGES_REQUESTED",
  "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING",
  "WORKSHOP_READY", "RETURNED_TO_STUDIO", "DELIVERED", "ISSUE",
];

const WORKSHOP_STATUSES: OrderStatus[] = [
  "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY", "RETURNED_TO_STUDIO", "DELIVERED", "ISSUE",
];

const StatusMultiSelect = memo(function StatusMultiSelect({
  selected,
  onChange,
  isWorkshop,
  t,
}: {
  selected: OrderStatus[];
  onChange: (statuses: OrderStatus[]) => void;
  isWorkshop: boolean;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const options: OrderStatus[] = isWorkshop
    ? (WORKSHOP_STATUSES as OrderStatus[])
    : (ORDER_STATUSES as unknown as OrderStatus[]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (status: OrderStatus) => {
    const next = selected.includes(status)
      ? selected.filter((s) => s !== status)
      : [...selected, status];
    onChange(next);
  };

  const label = selected.length === 0
    ? t.admin.filterByStatusAll
    : `${t.admin.filterByStatus} (${selected.length})`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 w-[160px] rounded-lg border px-2.5 py-[7px] text-xs font-medium transition-colors cursor-pointer hover:bg-gray-50 ${
          selected.length > 0
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-gray-300 bg-white text-gray-600"
        }`}
      >
        <Filter className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown className={`w-3 h-3 opacity-50 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-[320px] overflow-y-auto">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100 mb-0.5"
            >
              {t.admin.filterByStatusAll}
            </button>
          )}
          {options.map((status) => {
            const active = selected.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggle(status)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                  active ? "bg-amber-50 text-amber-900" : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[status] ?? "bg-gray-400"}`} />
                <span className="flex-1">{t.statuses[status]}</span>
                {active && <Check className="w-3.5 h-3.5 text-amber-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

function fmtShort(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const LOCALE_MAP: Record<string, string> = { ro: "ro-RO", ru: "ru-RU", en: "en-US" };

const DateRangeFilter = memo(function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
  locale,
  t,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  locale: string;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasValue = !!(dateFrom || dateTo);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [picking, setPicking] = useState<"from" | "to">("from");

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const ref = dateFrom || dateTo || toIso(today);
      const [y, m] = ref.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
      setPicking(dateFrom ? "to" : "from");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const intlLocale = LOCALE_MAP[locale] ?? "ro-RO";
  const monthName = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString(intlLocale, { month: "long", year: "numeric" });
  const weekDays = useMemo(() => {
    const base = new Date(2024, 0, 1);
    while (base.getDay() !== 1) base.setDate(base.getDate() + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString(intlLocale, { weekday: "short" }).slice(0, 2);
    });
  }, [intlLocale]);

  const days = getDaysInMonth(viewYear, viewMonth);
  const startDow = (days[0].getDay() + 6) % 7;
  const leadingBlanks = startDow;

  const handleDayClick = (day: Date) => {
    const iso = toIso(day);
    if (picking === "from") {
      if (dateTo && iso > dateTo) {
        onChange(iso, "");
        setPicking("to");
      } else {
        onChange(iso, dateTo);
        setPicking("to");
      }
    } else {
      if (dateFrom && iso < dateFrom) {
        onChange(iso, dateFrom);
      } else {
        onChange(dateFrom, iso);
      }
      setPicking("from");
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const label = !hasValue
    ? t.admin.filterByDate
    : dateFrom && dateTo
      ? `${fmtShort(dateFrom)} – ${fmtShort(dateTo)}`
      : dateFrom
        ? `${t.admin.filterDateFrom} ${fmtShort(dateFrom)}`
        : `${t.admin.filterDateTo} ${fmtShort(dateTo)}`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 w-[190px] rounded-lg border px-2.5 py-[7px] text-xs font-medium transition-colors cursor-pointer hover:bg-gray-50 ${
          hasValue
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-gray-300 bg-white text-gray-600"
        }`}
      >
        <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        {hasValue ? (
          <span
            role="button"
            tabIndex={0}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange("", ""); }}
            className="p-0.5 -mr-1 rounded hover:bg-amber-200/60 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </span>
        ) : (
          <ChevronDown className={`w-3 h-3 opacity-50 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-[280px] select-none">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-700 capitalize">{monthName}</span>
            <button type="button" onClick={nextMonth} className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {weekDays.map((wd, i) => (
              <div key={i} className="text-center text-[10px] font-medium text-gray-400 uppercase py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`b-${i}`} />
            ))}
            {days.map((day) => {
              const iso = toIso(day);
              const isFrom = iso === dateFrom;
              const isTo = iso === dateTo;
              const inRange = dateFrom && dateTo && iso > dateFrom && iso < dateTo;
              const isToday = iso === toIso(today);

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`relative h-8 text-xs rounded-md transition-colors ${
                    isFrom || isTo
                      ? "bg-amber-500 text-white font-bold"
                      : inRange
                        ? "bg-amber-100 text-amber-900"
                        : isToday
                          ? "font-bold text-amber-600 hover:bg-amber-50"
                          : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {/* Selection hint + clear */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {picking === "from" ? `↳ ${t.admin.filterDateFrom}` : `↳ ${t.admin.filterDateTo}`}
            </span>
            {hasValue && (
              <button
                type="button"
                onClick={() => { onChange("", ""); setPicking("from"); }}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
              >
                {t.admin.filterDateClear}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const STATUS_DOT_COLORS: Record<string, string> = {
  NEW: "bg-blue-500",
  IN_PROGRESS: "bg-slate-500",
  PENDING_APPROVAL: "bg-cyan-500",
  CHANGES_REQUESTED: "bg-pink-500",
  SENT_TO_WORKSHOP: "bg-yellow-500",
  WORKSHOP_PRINTING: "bg-orange-500",
  WORKSHOP_READY: "bg-purple-500",
  RETURNED_TO_STUDIO: "bg-indigo-500",
  DELIVERED: "bg-emerald-500",
  ISSUE: "bg-red-500",
};

const TRIGGER_COLORS: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  default: "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
  pink: "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
  orange: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100",
  purple: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  destructive: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  outline: "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
};

const StatusDropdown = memo(function StatusDropdown({
  order,
  t,
  isWorkshop,
  onStatusChange,
  statusTriggerTestScope,
  isSaving = false,
}: {
  order: { id: string; status: string };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  isWorkshop: boolean;
  onStatusChange: (id: string, status: string) => Promise<void>;
  /** Disambiguate main table vs workshop sidebar (same order can appear in both). */
  statusTriggerTestScope: "table" | "sidebar";
  isSaving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const statuses = isWorkshop ? WORKSHOP_STATUSES : ADMIN_STATUSES;
  const statusKey = order.status as OrderStatus;
  const variant = STATUS_VARIANT_MAP[statusKey] ?? "outline";

  useEffect(() => {
    if (!isSaving) return;
    queueMicrotask(() => {
      setOpen(false);
    });
  }, [isSaving]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = () => {
    if (isSaving) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = statuses.length * 36 + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < menuHeight && rect.top > menuHeight) {
        setPos({ top: rect.top - menuHeight - 4, left: rect.left });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left });
      }
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={isSaving}
        data-testid={`order-status-trigger-${statusTriggerTestScope}-${order.id}`}
        className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border py-1.5 pl-2.5 pr-3 text-left text-xs font-medium transition-colors ${
          isSaving ? "opacity-80 cursor-wait" : "cursor-pointer"
        } ${TRIGGER_COLORS[variant] ?? TRIGGER_COLORS.outline}`}
      >
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT_COLORS[order.status] ?? "bg-gray-400"}`} />
        <span className={`min-w-0 flex-1 truncate ${isSaving ? "opacity-80" : ""}`}>
          {t.statuses[statusKey] ?? order.status}
        </span>
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin opacity-80" />
        ) : (
          <ChevronDown
            className={`h-3 w-3 flex-shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 min-w-[210px] bg-white rounded-xl border border-gray-200 shadow-lg py-1"
        >
          {statuses.map((s) => {
            const isActive = s === order.status;
            return (
              <button
                key={s}
                type="button"
                data-testid={`status-option-${s}`}
                onClick={() => {
                  setOpen(false);
                  if (s !== order.status) onStatusChange(order.id, s);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-gray-50 font-medium text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[s] ?? "bg-gray-400"}`} />
                <span className="flex-1">{t.statuses[s] ?? s}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-gold" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
});

interface SpecFile {
  id: string;
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
}

function OrderFileSpecs({
  files,
  t,
  isMug,
}: {
  files: SpecFile[];
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  isMug?: boolean;
}) {
  if (files.length === 0) return null;

  if (isMug) {
    return (
      <div className="bg-amber-50 rounded px-2 py-1 text-[11px] text-amber-700 mb-1">
        {t.mug.productMug} · {t.admin.filesCount(files.length)}
      </div>
    );
  }

  const allSame =
    files.length > 1 &&
    files.every(
      (f) =>
        f.color === files[0].color &&
        f.paperType === files[0].paperType &&
        f.copies === files[0].copies,
    );

  const specBadge = (color: string, paper: string | null, copies: number) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
      {color === "color" ? (
        <span className="inline-flex items-center gap-0.5">
          <Palette className="w-3 h-3 text-violet-500" />
          {t.admin.color}
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5">
          <CircleOff className="w-3 h-3 text-gray-400" />
          {t.admin.bw}
        </span>
      )}
      <span className="text-gray-300">·</span>
      {formatPaperTypeLabel(paper, t.upload)}
      {copies > 1 && (
        <>
          <span className="text-gray-300">·</span>
          ×{copies}
        </>
      )}
    </span>
  );

  if (allSame) {
    const f = files[0];
    return (
      <div className="bg-gray-50 rounded px-2 py-1 text-[11px] text-gray-500 mb-1">
        <span className="font-medium text-gray-600">{t.admin.allSameSettings}:</span>{" "}
        {specBadge(f.color, f.paperType, f.copies)}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 mb-1">
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-1.5">
          {isExternalUrl(f.fileUrl) ? (
            <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
          ) : (
            <FileText className="w-3 h-3 text-gray-300 flex-shrink-0" />
          )}
          <span className="text-[11px] text-gray-500 truncate max-w-[100px]" title={f.fileName}>
            {f.fileName}
          </span>
          {specBadge(f.color, f.paperType, f.copies)}
        </div>
      ))}
    </div>
  );
}
