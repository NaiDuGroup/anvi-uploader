"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PDFDocument } from "pdf-lib";
import { FileLightbox, FileThumb } from "@/components/FileLightbox";
import { generatePreview } from "@/lib/generatePreview";
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
  Upload,
  Minus,
  Trash2,
  User,
  ChevronDown,
  Check,
  Flame,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { OrderStatus } from "@/lib/validations";

type PaperType = "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "other";
const PAPER_OPTIONS: PaperType[] = ["A6", "A5", "A4", "A3", "A2", "A1", "A0", "other"];

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

export default function AdminPage() {
  const { orders, loading, fetchOrders, updateOrder, deleteOrder } = useOrdersStore();
  const { t } = useLanguageStore();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);
  const [commentOrderId, setCommentOrderId] = useState<string | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
          setUserLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) router.push("/admin/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (userLoaded) {
      fetchOrders().catch(() => {
        router.push("/admin/login");
      });
    }
  }, [userLoaded, fetchOrders, router]);

  useEffect(() => {
    if (!userLoaded) return;
    const interval = setInterval(() => {
      fetchOrders().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [userLoaded, fetchOrders]);

  const isWorkshop = currentUser?.role === "workshop";
  const commentOrder = commentOrderId
    ? orders.find((o) => o.id === commentOrderId) ?? null
    : null;

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  const mainOrders = orders.filter((order) => {
    if (searchQuery && !order.phone.includes(searchQuery)) return false;
    if (!isWorkshop && onlyMine) return order.createdBy === currentUser?.id;
    return true;
  });

  const workshopOrders = orders.filter((o) => o.isWorkshop);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (newStatus === "ISSUE") {
      setIssueOrderId(orderId);
      return;
    }
    await updateOrder(orderId, { status: newStatus as OrderStatus });
  };

  const handleConfirmIssue = async (reason: string) => {
    if (!issueOrderId) return;
    await updateOrder(issueOrderId, { status: "ISSUE", issueReason: reason });
    setIssueOrderId(null);
  };

  const handleTogglePrio = async (orderId: string, currentPrio: boolean) => {
    await updateOrder(orderId, { isPrio: !currentPrio });
  };

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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-red-600 hover:text-red-700"
            >
              <LogOut className="w-4 h-4" />
              {t.login.logout}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-6">
        {isWorkshop ? (
          /* ── Workshop: single full-width table ── */
          <OrderTable
            orders={mainOrders}
            loading={loading}
            isWorkshop
            t={t}
            onStatusChange={handleStatusChange}
            onComment={setCommentOrderId}
            onTogglePrio={handleTogglePrio}
            onEdit={setEditOrderId}
            onDelete={setDeleteOrderId}
          />
        ) : (
          /* ── Admin: two-column layout ── */
          <>
            <div className="mb-4 flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder={t.admin.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-gray-300 cursor-pointer accent-gold"
                />
                <span className="text-sm text-gray-600">{t.admin.filterMine}</span>
              </label>
            </div>

            <div className="flex gap-5">
              {/* Left: all orders */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    {t.admin.filterAll}
                    <span className="ml-1.5 text-gray-400 normal-case tracking-normal font-normal">
                      ({mainOrders.length})
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
                  orders={mainOrders}
                  loading={loading}
                  isWorkshop={false}
                  t={t}
                  onStatusChange={handleStatusChange}
                  onComment={setCommentOrderId}
                  onTogglePrio={handleTogglePrio}
                  onEdit={setEditOrderId}
                  onDelete={setDeleteOrderId}
                />
              </div>

              {/* Right: workshop sidebar (collapsible) */}
              {workshopOpen && (
                <div className="w-[340px] flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                      {t.admin.filterWorkshop}
                      <span className="ml-1.5 text-gray-400 normal-case tracking-normal font-normal">
                        ({workshopOrders.length})
                      </span>
                    </h2>
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
                    onStatusChange={handleStatusChange}
                    onComment={setCommentOrderId}
                    onTogglePrio={handleTogglePrio}
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
  onStatusChange: (id: string, status: string) => Promise<void>;
  onComment: (id: string) => void;
  onTogglePrio: (id: string, current: boolean) => Promise<void>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function OrderTable({
  orders,
  loading,
  isWorkshop,
  t,
  onStatusChange,
  onComment,
  onTogglePrio,
  onEdit,
  onDelete,
}: OrderTableProps) {
  const [lightboxFile, setLightboxFile] = useState<{ id: string; name: string } | null>(null);

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">
        {loading ? t.admin.loadingOrders : t.admin.noOrders}
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
        <table className="w-full">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">{t.admin.order}</th>
              <th className="px-4 py-3">
                {isWorkshop ? t.admin.createdByLabel : t.common.phone}
              </th>
              <th className="px-4 py-3">{t.common.files}</th>
              <th className="px-4 py-3">{t.common.status}</th>
              <th className="px-4 py-3">{t.common.created}</th>
              {!isWorkshop && <th className="px-4 py-3">{t.common.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.map((order) => (
              <tr
                key={order.id}
                className={
                  order.isPrio
                    ? "bg-red-50/60 hover:bg-red-50 border-l-3 border-l-red-400"
                    : order.status === "DELIVERED"
                      ? "bg-green-50/40 opacity-60 hover:opacity-100 transition-opacity"
                      : "hover:bg-gray-50"
                }
              >
                <td className="px-4 py-3">
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
                      className="relative p-1 rounded hover:bg-gray-100 transition-colors"
                      title={t.admin.comments}
                    >
                      <MessageCircle className="w-4 h-4 text-gray-400" />
                      {order.commentCount > 0 && (
                        <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-gray-200 text-gray-600 rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                          {order.commentCount}
                        </span>
                      )}
                      {order.unreadCommentCount > 0 && (
                        <span className="absolute -top-1.5 -left-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
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
                <td className="px-4 py-3 text-sm">
                  {isWorkshop ? (
                    <span className="font-medium">
                      {order.createdByName ?? "—"}
                    </span>
                  ) : (
                    <>
                      <span>{order.phone}</span>
                      {order.clientName && (
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {order.clientName}
                        </p>
                      )}
                      {order.createdByName && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          {order.createdByName}
                        </p>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">
                      {t.admin.filesCount(order.files.length)}
                    </span>
                    {order.files.length > 1 && (
                      <a
                        href={`/api/download/order/${order.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        {t.admin.downloadAll}
                      </a>
                    )}
                  </div>
                  <OrderFileSpecs files={order.files} t={t} />
                  <div className="text-xs text-gray-500 space-y-1 mt-1.5">
                    {order.files.map((f) => (
                      <div key={f.id} className="flex items-center gap-1.5">
                        <FileThumb
                          fileId={f.id}
                          fileName={f.fileName}
                          onClick={() => setLightboxFile({ id: f.id, name: f.fileName })}
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => setLightboxFile({ id: f.id, name: f.fileName })}
                            className="text-blue-600 hover:underline truncate block max-w-full text-left"
                          >
                            {f.fileName}
                          </button>
                          {f.pageCount && (
                            <span className="text-gray-400">
                              {t.admin.pagesCount(f.pageCount)}
                            </span>
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
                </td>
                <td className="px-4 py-3">
                  <StatusDropdown
                    order={order}
                    t={t}
                    isWorkshop={isWorkshop}
                    onStatusChange={onStatusChange}
                  />
                  {order.assignedToName && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      {t.admin.takenBy}: <span className="font-medium">{order.assignedToName}</span>
                    </p>
                  )}
                  {order.status === "ISSUE" && order.issueReason && (
                    <p className="text-xs text-red-600 mt-1 flex items-start gap-1 max-w-[200px]">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="leading-tight">{order.issueReason}</span>
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(order.createdAt).toLocaleString()}
                </td>
                {!isWorkshop && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onTogglePrio(order.id, order.isPrio)}
                        className={`p-1.5 rounded-md transition-colors ${
                          order.isPrio
                            ? "text-red-500 bg-red-50 hover:bg-red-100"
                            : "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                        }`}
                        title={order.isPrio ? t.admin.prioOff : t.admin.prioOn}
                      >
                        <Flame className="w-4 h-4" />
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
}

function WorkshopSidebar({
  orders,
  t,
  onStatusChange,
  onComment,
  onTogglePrio,
}: {
  orders: ReturnType<typeof useOrdersStore.getState>["orders"];
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onStatusChange: (id: string, status: string) => Promise<void>;
  onComment: (id: string) => void;
  onTogglePrio: (id: string, current: boolean) => Promise<void>;
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
                className={`p-1 rounded transition-colors ${
                  order.isPrio
                    ? "text-red-500 hover:bg-red-100"
                    : "text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                }`}
                title={order.isPrio ? t.admin.prioOff : t.admin.prioOn}
              >
                <Flame className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onComment(order.id)}
                className="relative p-1 rounded hover:bg-gray-100 transition-colors"
                title={t.admin.comments}
              >
                <MessageCircle className="w-4 h-4 text-gray-400" />
                {order.commentCount > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-gray-200 text-gray-600 rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {order.commentCount}
                  </span>
                )}
                {order.unreadCommentCount > 0 && (
                  <span className="absolute -top-1.5 -left-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                )}
              </button>
            </div>
          </div>

          {/* Row 2: status dropdown */}
          <div className="mb-2">
            <StatusDropdown
              order={order}
              t={t}
              isWorkshop={false}
              onStatusChange={onStatusChange}
            />
          </div>

          {/* Row 3: creator + file info */}
          <div className="text-xs text-gray-500 space-y-0.5">
            {order.createdByName && (
              <p className="flex items-center gap-1">
                <UserCheck className="w-3 h-3" />
                {order.createdByName}
              </p>
            )}
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
            <div className="flex items-center gap-1 mt-1">
              {order.files.map((f) => (
                <FileThumb
                  key={f.id}
                  fileId={f.id}
                  fileName={f.fileName}
                  onClick={() => setLightboxFile({ id: f.id, name: f.fileName })}
                />
              ))}
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
}

const ADMIN_STATUSES: OrderStatus[] = [
  "NEW", "IN_PROGRESS", "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING",
  "WORKSHOP_READY", "RETURNED_TO_STUDIO", "DELIVERED", "ISSUE",
];

const WORKSHOP_STATUSES: OrderStatus[] = [
  "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY", "RETURNED_TO_STUDIO", "DELIVERED", "ISSUE",
];

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

function StatusDropdown({
  order,
  t,
  isWorkshop,
  onStatusChange,
}: {
  order: { id: string; status: string };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  isWorkshop: boolean;
  onStatusChange: (id: string, status: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const statuses = isWorkshop ? WORKSHOP_STATUSES : ADMIN_STATUSES;
  const statusKey = order.status as OrderStatus;
  const variant = STATUS_VARIANT_MAP[statusKey] ?? "outline";

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
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${TRIGGER_COLORS[variant] ?? TRIGGER_COLORS.outline}`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[order.status] ?? "bg-gray-400"}`} />
        {t.statuses[statusKey] ?? order.status}
        <ChevronDown className={`w-3 h-3 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
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
}

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

type IssueReasonKey = keyof typeof import("@/lib/i18n/en").en.admin.issueReasons;
const ISSUE_REASON_KEYS: IssueReasonKey[] = [
  "fileCorrupt",
  "wrongFormat",
  "lowQuality",
  "missingPages",
  "other",
];

function IssueReasonModal({
  t,
  onConfirm,
  onClose,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<IssueReasonKey | null>(null);
  const [customText, setCustomText] = useState("");

  const handleSubmit = () => {
    if (!selected) return;
    const reason =
      selected === "other"
        ? customText.trim() || t.admin.issueReasons.other
        : t.admin.issueReasons[selected];
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold">{t.admin.issueModalTitle}</h2>
        </div>

        <div className="space-y-2 mb-4">
          {ISSUE_REASON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                selected === key
                  ? "border-red-400 bg-red-50 text-red-700 font-medium"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t.admin.issueReasons[key]}
            </button>
          ))}
        </div>

        {selected === "other" && (
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={t.admin.issueReasonPlaceholder}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-4 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
          />
        )}

        <Button
          className="w-full bg-red-600 hover:bg-red-700 text-white"
          disabled={!selected || (selected === "other" && !customText.trim())}
          onClick={handleSubmit}
        >
          <AlertTriangle className="w-4 h-4" />
          {t.admin.issueConfirm}
        </Button>
      </div>
    </div>
  );
}

interface CommentMessage {
  id: string;
  text: string;
  createdAt: string;
  userName: string;
  userRole: string;
  isOwn: boolean;
}

function CommentPanel({
  orderId,
  orderNumber,
  t,
  onClose,
}: {
  orderId: string;
  orderNumber: number;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<CommentMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}/comments`);
      if (res.ok) {
        const data: CommentMessage[] = await res.json();
        setMessages(data);
      }
    } catch {
      /* ignore polling errors */
    }
  }, [orderId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    const interval = setInterval(fetchComments, 5000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.ok) {
        const msg: CommentMessage = await res.json();
        setMessages((prev) => [...prev, msg]);
        setText("");
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const roleLabel = (role: string) =>
    role === "workshop" ? t.admin.roleWorkshop : t.admin.roleAdmin;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">
              {t.admin.comments} — #{String(orderNumber).padStart(4, "0")}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">{t.admin.noComments}</p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.isOwn ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-medium text-gray-600">{msg.userName}</span>
                <Badge
                  variant={msg.userRole === "workshop" ? "warning" : "secondary"}
                  className="text-[9px] px-1 py-0"
                >
                  {roleLabel(msg.userRole)}
                </Badge>
              </div>
              <div
                className={`rounded-2xl px-3.5 py-2 max-w-[85%] text-sm leading-relaxed ${
                  msg.isOwn
                    ? "bg-gold text-white rounded-br-md"
                    : "bg-gray-100 text-gray-900 rounded-bl-md"
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-gray-400 mt-0.5">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.admin.commentPlaceholder}
            maxLength={1000}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <Button size="sm" onClick={handleSend} disabled={!text.trim() || sending}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  t,
  onConfirm,
  onClose,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold">{t.admin.deleteOrder}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-6">{t.admin.deleteConfirmText}</p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={deleting}
          >
            {t.admin.cancel}
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="w-4 h-4" />
            {t.admin.deleteConfirm}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditOrderModal({
  order,
  t,
  onClose,
  onSaved,
}: {
  order: { id: string; phone: string; clientName: string | null; notes: string | null };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { updateOrder } = useOrdersStore();
  const [phone, setPhone] = useState(order.phone);
  const [clientName, setClientName] = useState(order.clientName ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (phone.length < 8) return;
    setSaving(true);
    setError("");
    try {
      await updateOrder(order.id, {
        phone,
        clientName: clientName.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-bold">{t.admin.editOrder}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.common.phone} *</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder={t.admin.clientPhonePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t.admin.clientName}</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t.admin.clientNamePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t.upload.notesLabel}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.upload.notesPlaceholder}
              maxLength={500}
              rows={3}
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              {t.admin.cancel}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={phone.length < 8 || saving}
            >
              {saving ? t.admin.saving : t.admin.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdminFileEntry {
  file: File;
  copies: number;
  color: "bw" | "color";
  paperType: PaperType;
  pageCount?: number;
  previewUrl?: string;
}

function CreateOrderModal({
  t,
  onClose,
  onCreated,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createAdminOrder } = useOrdersStore();
  const [files, setFiles] = useState<AdminFileEntry[]>([]);
  const [phone, setPhone] = useState("");
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState<"bw" | "color">("bw");
  const [paperType, setPaperType] = useState<PaperType>("A4");
  const [copies, setCopies] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");

  const paperLabels: Record<PaperType, string> = {
    A0: t.upload.paperA0, A1: t.upload.paperA1, A2: t.upload.paperA2,
    A3: t.upload.paperA3, A4: t.upload.paperA4, A5: t.upload.paperA5,
    A6: t.upload.paperA6, other: t.upload.paperOther,
  };

  const addFiles = useCallback(async (newFiles: FileList | null) => {
    if (!newFiles) return;
    const entries: AdminFileEntry[] = await Promise.all(
      Array.from(newFiles).map(async (file) => {
        let pageCount: number | undefined;
        if (file.type === "application/pdf") {
          try {
            const buf = await file.arrayBuffer();
            const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
            pageCount = doc.getPageCount();
          } catch { /* non-countable PDF */ }
        }
        const previewUrl = await generatePreview(file);
        return { file, copies: 1, color: "bw" as const, paperType: "A4" as const, pageCount, previewUrl };
      }),
    );
    setFiles((prev) => [...prev, ...entries]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const entry = prev[index];
      if (entry?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(entry.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (files.length === 0 || phone.length < 8) return;
    setSubmitting(true);
    setError("");

    try {
      const fileData = await Promise.all(
        files.map(async (entry) => {
          const res = await fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: entry.file.name,
              contentType: entry.file.type || "application/octet-stream",
            }),
          });
          if (!res.ok) throw new Error("Failed to get upload URL");
          const { uploadUrl, fileKey } = await res.json();

          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": entry.file.type || "application/octet-stream" },
            body: entry.file,
          });
          if (!uploadRes.ok) throw new Error("Failed to upload file");

          return {
            fileName: entry.file.name,
            fileUrl: fileKey,
            copies,
            color,
            paperType,
            pageCount: entry.pageCount,
          };
        }),
      );

      await createAdminOrder({
        phone,
        clientName: clientName.trim() || undefined,
        notes: notes.trim() || undefined,
        files: fileData,
      });

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = files.length > 0 && phone.length >= 8 && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 text-gray-900 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Plus className="w-5 h-5 text-gold" />
          <h2 className="text-lg font-bold">{t.admin.newOrder}</h2>
        </div>

        <div className="space-y-5">
          {/* File upload */}
          <div>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                dragActive
                  ? "border-gold bg-gold-light"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-1">{t.upload.dragDrop}</p>
              <label className="cursor-pointer">
                <span className="text-gold hover:underline font-medium text-sm">
                  {t.upload.browseFiles}
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>
            </div>

            {files.length > 0 && (
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mt-3">
                {files.map((entry, index) => (
                  <div key={index} className="flex items-start gap-3 px-3 py-2.5">
                    {entry.previewUrl ? (
                      <img
                        src={entry.previewUrl}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100 border border-gray-200"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-sm text-gray-900 truncate">{entry.file.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {(entry.file.size / 1024).toFixed(1)} KB
                        {entry.pageCount !== undefined && ` · ${t.admin.pagesCount(entry.pageCount)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Print settings — shared for all files */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            {/* Color / BW */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                {t.upload.colorOption}/{t.upload.bwOption}
              </span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setColor("color")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                    color === "color"
                      ? "bg-gold text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  {t.upload.colorOption}
                </button>
                <button
                  type="button"
                  onClick={() => setColor("bw")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                    color === "bw"
                      ? "bg-gray-800 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <CircleOff className="w-3.5 h-3.5" />
                  {t.upload.bwOption}
                </button>
              </div>
            </div>

            {/* Paper size */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{t.upload.paperSize}</span>
              <select
                value={paperType}
                onChange={(e) => setPaperType(e.target.value as PaperType)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-gold"
              >
                {PAPER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{paperLabels[opt]}</option>
                ))}
              </select>
            </div>

            {/* Copies */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{t.upload.copiesLabel}</span>
              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCopies(Math.max(1, copies - 1))}
                  className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30"
                  disabled={copies <= 1}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center text-sm font-medium text-gray-900 tabular-nums">
                  {copies}
                </span>
                <button
                  type="button"
                  onClick={() => setCopies(copies + 1)}
                  className="px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.common.phone} *</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder={t.admin.clientPhonePlaceholder}
            />
          </div>

          {/* Client name */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.admin.clientName}</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t.admin.clientNamePlaceholder}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.upload.notesLabel}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.upload.notesPlaceholder}
              maxLength={500}
              rows={2}
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full"
            size="lg"
            disabled={!canSubmit}
          >
            {submitting ? t.admin.creatingOrder : t.admin.createOrder}
          </Button>
        </div>
      </div>
    </div>
  );
}
