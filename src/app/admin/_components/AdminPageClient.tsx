"use client";

import { useEffect, useState, useRef, useCallback, memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { FileLightbox, FileThumb } from "@/components/FileLightbox";
import { playNotificationSound } from "@/lib/notificationSound";
import {
  RefreshCw,
  Search,
  UserCheck,
  AlertTriangle,
  LogOut,
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
} from "lucide-react";
import type { OrderStatus } from "@/lib/validations";
import { ORDER_STATUSES } from "@/lib/validations";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const CreateOrderModal = dynamic(() => import("./CreateOrderModal"), { ssr: false });
const EditOrderModal = dynamic(() => import("./EditOrderModal"), { ssr: false });
const IssueReasonModal = dynamic(() => import("./IssueReasonModal"), { ssr: false });
const CommentPanel = dynamic(() => import("./CommentPanel"), { ssr: false });
const DeleteConfirmModal = dynamic(() => import("./DeleteConfirmModal"), { ssr: false });

type AdminOrderSaving = { orderId: string; kind: "status" | "prio" } | null;

function AdminPhoneSearch({
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
        data-testid="admin-search-phone"
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

const STATUS_VARIANT_MAP: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
> = {
  NEW: "info",
  IN_PROGRESS: "default",
  SENT_TO_WORKSHOP: "warning",
  WORKSHOP_PRINTING: "warning",
  WORKSHOP_READY: "secondary",
  RETURNED_TO_STUDIO: "info",
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
  const setSearch = useOrdersStore((s) => s.setSearch);
  const setFilter = useOrdersStore((s) => s.setFilter);
  const setStatusFilter = useOrdersStore((s) => s.setStatusFilter);
  const setDateFilter = useOrdersStore((s) => s.setDateFilter);

  const { t, locale } = useLanguageStore();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");

  const tableTopRef = useRef<HTMLDivElement>(null);
  const setPage = useCallback((p: number) => {
    rawSetPage(p);
    tableTopRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [rawSetPage]);
  const currentUser = initialData.currentUser;
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [commentOrderId, setCommentOrderId] = useState<string | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
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

    if (hasFilters) {
      fetchOrders().catch(() => router.push("/admin/login"));
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
  const totalUnread = useMemo(
    () => orders.reduce((sum, o) => sum + o.unreadCommentCount, 0),
    [orders],
  );

  useEffect(() => {
    if (prevUnreadRef.current !== null && totalUnread > prevUnreadRef.current) {
      playNotificationSound();
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread]);

  const isWorkshop = currentUser?.role === "workshop";
  const commentOrder = commentOrderId
    ? (orders.find((o) => o.id === commentOrderId)
      ?? workshopOrders.find((o) => o.id === commentOrderId)
      ?? null)
    : null;

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

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

  const pageTitle = isWorkshop ? t.admin.workshopTitle : t.admin.title;
  const roleName = isWorkshop ? t.admin.roleWorkshop : t.admin.roleAdmin;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ANVI" className="w-10 h-10 rounded-full" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{pageTitle}</h1>
              <p className="text-xs text-gray-500">
                {t.admin.loggedInAs}{" "}
                <span className="font-medium">{currentUser.name}</span>
                {" · "}
                <Badge variant={isWorkshop ? "warning" : "secondary"} className="text-[10px] px-1.5 py-0">
                  {roleName}
                </Badge>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {!isWorkshop && (
              <Button
                size="sm"
                onClick={() => setShowCreateOrder(true)}
              >
                <Plus className="w-4 h-4" />
                {t.admin.newOrder}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOrders()}
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              {t.common.refresh}
            </Button>
            {totalUnread > 0 && (
              <div
                className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-blue-700 animate-pulse"
                title={t.admin.unreadComments}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-sm font-bold">{totalUnread}</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              {t.login.logout}
            </Button>
          </div>
        </div>
      </header>

      <main ref={tableTopRef} className="max-w-[1600px] mx-auto px-4 py-6 scroll-mt-[72px]">
        {isWorkshop ? (
          /* ── Workshop: single full-width table ── */
          <>
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AdminPhoneSearch
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
              onTogglePrio={handleTogglePrio}
              onEdit={setEditOrderId}
              onDelete={setDeleteOrderId}
            />
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-1">
                <span className="text-sm text-gray-500">
                  {page} / {totalPages} ({totalCount})
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium tabular-nums min-w-[3ch] text-center">{page}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Admin: two-column layout ── */
          <>
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AdminPhoneSearch
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
                  onTogglePrio={handleTogglePrio}
                  onEdit={setEditOrderId}
                  onDelete={setDeleteOrderId}
                />
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 px-1">
                    <span className="text-sm text-gray-500">
                      {page} / {totalPages} ({totalCount})
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm font-medium tabular-nums min-w-[3ch] text-center">{page}</span>
                      <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
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
          onClose={() => {
            setCommentOrderId(null);
            fetchOrders().catch(() => {});
          }}
        />
      )}

      {showCreateOrder && (
        <CreateOrderModal
          t={t}
          onClose={() => setShowCreateOrder(false)}
          onCreated={() => {
            setShowCreateOrder(false);
            fetchOrders().catch(() => {});
          }}
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
    </div>
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
  onTogglePrio: (id: string, current: boolean) => Promise<void>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/** From this many files, the list + specs collapse behind a toggle to keep table rows compact. */
const FILES_ACCORDION_MIN = 4;

const AdminOrderFilesCell = memo(function AdminOrderFilesCell({
  order,
  t,
  setLightboxFile,
}: {
  order: {
    id: string;
    files: Array<{
      id: string;
      fileName: string;
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
          <OrderFileSpecs files={order.files} t={t} />
          <div className="text-xs text-gray-500 space-y-1 mt-1.5">
            {order.files.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5">
                <FileThumb
                  fileId={f.id}
                  fileName={f.fileName}
                  onClick={() => setLightboxFile({ id: f.id, name: f.fileName })}
                />
                <div className="min-w-0 flex-1 max-w-[280px]">
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
                </div>
                <a
                  href={`/api/download/${f.id}`}
                  className="text-gray-400 hover:text-blue-600 flex-shrink-0 p-0.5"
                  title="Download"
                >
                  <Download className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

const OrderTable = memo(function OrderTable({
  orders,
  loading,
  isWorkshop,
  t,
  orderSaving,
  onStatusChange,
  onComment,
  onTogglePrio,
  onEdit,
  onDelete,
}: OrderTableProps) {
  const [lightboxFile, setLightboxFile] = useState<{ id: string; name: string } | null>(null);

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 bg-white rounded-lg shadow">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
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
                <col style={{ width: "14%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "27%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "14%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "14%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "9%" }} />
              </>
            )}
          </colgroup>
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3">{t.admin.order}</th>
              <th className="px-3 py-3">{t.common.phone}</th>
              <th className="px-3 py-3">{t.common.files}</th>
              <th className="px-3 py-3">{t.common.createdBySentBy}</th>
              <th className="px-3 py-3">{t.common.status}</th>
              <th className="px-3 py-3">{t.common.created}</th>
              {!isWorkshop && <th className="px-3 py-3">{t.common.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((order) => (
              <tr
                key={order.id}
                className={
                  order.isPrio
                    ? "bg-red-50/60 hover:bg-red-50 border-l-3 border-l-red-400"
                    : order.unreadCommentCount > 0
                      ? "bg-blue-50/50 hover:bg-blue-50 border-l-3 border-l-blue-400"
                      : order.status === "DELIVERED"
                        ? "bg-green-50/40 opacity-60 hover:opacity-100 transition-opacity"
                        : "hover:bg-gray-50"
                }
              >
                <td className="px-3 py-3 overflow-hidden">
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
                    <button
                      type="button"
                      onClick={() => onComment(order.id)}
                      className={`relative p-1 rounded transition-colors ${
                        order.unreadCommentCount > 0
                          ? "hover:bg-blue-100 animate-pulse"
                          : "hover:bg-gray-100"
                      }`}
                      title={t.admin.comments}
                    >
                      <MessageCircle className={`w-4 h-4 ${
                        order.unreadCommentCount > 0 ? "text-blue-500" : "text-gray-400"
                      }`} />
                      {order.commentCount > 0 && (
                        <span className={`absolute -top-1 -right-1 text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${
                          order.unreadCommentCount > 0
                            ? "bg-red-500 text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}>
                          {order.unreadCommentCount > 0 ? order.unreadCommentCount : order.commentCount}
                        </span>
                      )}
                    </button>
                  </div>
                  {order.notes && (
                    <div className="mt-1.5 flex items-start gap-1 max-w-[180px]">
                      <StickyNote className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-gray-500 leading-tight line-clamp-3" title={order.notes}>
                        {order.notes}
                      </p>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-sm overflow-hidden">
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
                </td>
                <td className="px-3 py-3 overflow-hidden">
                  <AdminOrderFilesCell order={order} t={t} setLightboxFile={setLightboxFile} />
                </td>
                <td className="px-3 py-3 text-sm text-gray-600 overflow-hidden">
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
                <td className="px-3 py-3 overflow-hidden">
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
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      {t.common.statusChangedBy}: <span className="font-medium">{order.assignedToName}</span>
                    </p>
                  )}
                  {order.status === "ISSUE" && order.issueReason && (
                    <p className="text-xs text-red-600 mt-1 flex items-start gap-1 max-w-[200px]">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="leading-tight">{order.issueReason}</span>
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 text-sm text-gray-600">
                  {new Date(order.createdAt).toLocaleString()}
                </td>
                {!isWorkshop && (
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
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
                    </div>
                  </td>
                )}
              </tr>
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
          className={`rounded-lg border shadow-sm p-3 transition-colors ${
            order.isPrio
              ? "border-red-200 bg-red-50/70"
              : order.unreadCommentCount > 0
                ? "border-blue-200 bg-blue-50/50"
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
                    ? "hover:bg-blue-100 animate-pulse"
                    : "hover:bg-gray-100"
                }`}
                title={t.admin.comments}
              >
                <MessageCircle className={`w-4 h-4 ${
                  order.unreadCommentCount > 0 ? "text-blue-500" : "text-gray-400"
                }`} />
                {order.commentCount > 0 && (
                  <span className={`absolute -top-1 -right-1 text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ${
                    order.unreadCommentCount > 0
                      ? "bg-red-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}>
                    {order.unreadCommentCount > 0 ? order.unreadCommentCount : order.commentCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: status (read-only) */}
          <div className="mb-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              TRIGGER_COLORS[STATUS_VARIANT_MAP[order.status as OrderStatus] ?? "outline"]
            }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[order.status] ?? "bg-gray-400"}`} />
              {t.statuses[order.status as OrderStatus] ?? order.status}
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
              {order.files[0]?.paperType && (
                <span className="text-gray-400">· {order.files[0].paperType}</span>
              )}
              {order.files[0] && (
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
          </div>
        </div>
      ))}
    </div>
    </>
  );
});

const ADMIN_STATUSES: OrderStatus[] = [
  "NEW", "IN_PROGRESS", "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING",
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
  NEW: "bg-blue-400",
  IN_PROGRESS: "bg-gray-500",
  SENT_TO_WORKSHOP: "bg-amber-400",
  WORKSHOP_PRINTING: "bg-amber-500",
  WORKSHOP_READY: "bg-purple-400",
  RETURNED_TO_STUDIO: "bg-blue-400",
  DELIVERED: "bg-green-500",
  ISSUE: "bg-red-500",
};

const TRIGGER_COLORS: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  default: "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
  warning: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  secondary: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
  success: "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
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
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          isSaving ? "opacity-80 cursor-wait" : "cursor-pointer"
        } ${TRIGGER_COLORS[variant] ?? TRIGGER_COLORS.outline}`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[order.status] ?? "bg-gray-400"}`} />
        <span className={isSaving ? "opacity-80" : ""}>{t.statuses[statusKey] ?? order.status}</span>
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin opacity-80 flex-shrink-0" />
        ) : (
          <ChevronDown className={`w-3 h-3 opacity-50 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
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
  copies: number;
  color: string;
  paperType: string | null;
  pageCount: number | null;
}

function OrderFileSpecs({
  files,
  t,
}: {
  files: SpecFile[];
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}) {
  if (files.length === 0) return null;

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
      {paper ?? "—"}
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
          <FileText className="w-3 h-3 text-gray-300 flex-shrink-0" />
          <span className="text-[11px] text-gray-500 truncate max-w-[100px]" title={f.fileName}>
            {f.fileName}
          </span>
          {specBadge(f.color, f.paperType, f.copies)}
        </div>
      ))}
    </div>
  );
}
