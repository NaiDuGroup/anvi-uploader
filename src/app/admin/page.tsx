"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  RefreshCw,
  Search,
  UserCheck,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  LogOut,
  Printer,
  Download,
} from "lucide-react";
import type { OrderStatus } from "@/lib/validations";

const STATUS_VARIANT_MAP: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
> = {
  NEW: "info",
  IN_PROGRESS: "default",
  ASSIGNED: "secondary",
  SENT_TO_WORKSHOP: "warning",
  WORKSHOP_PRINTING: "warning",
  READY: "success",
  ISSUE: "destructive",
};

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

export default function AdminPage() {
  const { orders, loading, fetchOrders, updateOrder } = useOrdersStore();
  const { t } = useLanguageStore();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);

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

  const isWorkshop = currentUser?.role === "workshop";

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  const filteredOrders = orders.filter((order) =>
    searchQuery ? order.phone.includes(searchQuery) : true
  );

  const handleTakeInWork = async (orderId: string) => {
    await updateOrder(orderId, { status: "IN_PROGRESS" });
  };

  const handleMarkReady = async (orderId: string) => {
    await updateOrder(orderId, { status: "READY" });
  };

  const handleSendToWorkshop = async (orderId: string) => {
    await updateOrder(orderId, {
      status: "SENT_TO_WORKSHOP",
      isWorkshop: true,
    });
  };

  const handleMarkIssue = async (orderId: string) => {
    await updateOrder(orderId, { status: "ISSUE" });
  };

  const handleStartPrinting = async (orderId: string) => {
    await updateOrder(orderId, { status: "WORKSHOP_PRINTING" });
  };

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
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
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

      <main className="max-w-7xl mx-auto px-4 py-6">
        {!isWorkshop && (
          <div className="mb-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t.admin.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 max-w-md"
            />
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {loading ? t.admin.loadingOrders : t.admin.noOrders}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">{t.admin.order}</th>
                    {!isWorkshop && (
                      <th className="px-4 py-3">{t.common.phone}</th>
                    )}
                    <th className="px-4 py-3">{t.common.files}</th>
                    <th className="px-4 py-3">{t.common.status}</th>
                    <th className="px-4 py-3">{t.common.created}</th>
                    <th className="px-4 py-3">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.map((order) => {
                    const statusKey = order.status as OrderStatus;
                    const variant =
                      STATUS_VARIANT_MAP[statusKey] ?? ("outline" as const);
                    const statusLabel =
                      t.statuses[statusKey] ?? order.status;
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs">
                            {order.id.slice(0, 8)}...
                          </span>
                        </td>
                        {!isWorkshop && (
                          <td className="px-4 py-3 text-sm">{order.phone}</td>
                        )}
                        <td className="px-4 py-3">
                          <span className="text-sm">
                            {t.admin.filesCount(order.files.length)}
                          </span>
                          <div className="text-xs text-gray-500 space-y-0.5">
                            {order.files.map((f) => (
                              <a
                                key={f.id}
                                href={`/api/download/${f.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <Download className="w-3 h-3" />
                                {f.fileName}
                              </a>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={variant}>{statusLabel}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {isWorkshop ? (
                            <WorkshopActions
                              order={order}
                              t={t}
                              onStartPrinting={handleStartPrinting}
                              onMarkReady={handleMarkReady}
                              onMarkIssue={handleMarkIssue}
                            />
                          ) : (
                            <AdminActions
                              order={order}
                              t={t}
                              onTakeInWork={handleTakeInWork}
                              onSendToWorkshop={handleSendToWorkshop}
                              onMarkReady={handleMarkReady}
                              onMarkIssue={handleMarkIssue}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface ActionProps {
  order: { id: string; status: string };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}

interface AdminActionsProps extends ActionProps {
  onTakeInWork: (id: string) => Promise<void>;
  onSendToWorkshop: (id: string) => Promise<void>;
  onMarkReady: (id: string) => Promise<void>;
  onMarkIssue: (id: string) => Promise<void>;
}

function AdminActions({
  order,
  t,
  onTakeInWork,
  onSendToWorkshop,
  onMarkReady,
  onMarkIssue,
}: AdminActionsProps) {
  return (
    <div className="flex gap-1 flex-wrap">
      {order.status === "NEW" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onTakeInWork(order.id)}
        >
          <UserCheck className="w-3 h-3" />
          {t.admin.take}
        </Button>
      )}
      {["IN_PROGRESS", "ASSIGNED"].includes(order.status) && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSendToWorkshop(order.id)}
          >
            <ArrowRight className="w-3 h-3" />
            {t.admin.workshop}
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => onMarkReady(order.id)}
          >
            <CheckCircle className="w-3 h-3" />
            {t.admin.ready}
          </Button>
        </>
      )}
      {order.status !== "READY" && order.status !== "ISSUE" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onMarkIssue(order.id)}
          className="text-red-600"
        >
          <AlertTriangle className="w-3 h-3" />
          {t.admin.issue}
        </Button>
      )}
    </div>
  );
}

interface WorkshopActionsProps extends ActionProps {
  onStartPrinting: (id: string) => Promise<void>;
  onMarkReady: (id: string) => Promise<void>;
  onMarkIssue: (id: string) => Promise<void>;
}

function WorkshopActions({
  order,
  t,
  onStartPrinting,
  onMarkReady,
  onMarkIssue,
}: WorkshopActionsProps) {
  return (
    <div className="flex gap-1 flex-wrap">
      {order.status === "SENT_TO_WORKSHOP" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStartPrinting(order.id)}
        >
          <Printer className="w-3 h-3" />
          {t.admin.startPrinting}
        </Button>
      )}
      {order.status === "WORKSHOP_PRINTING" && (
        <Button
          size="sm"
          variant="default"
          onClick={() => onMarkReady(order.id)}
        >
          <CheckCircle className="w-3 h-3" />
          {t.admin.ready}
        </Button>
      )}
      {order.status !== "READY" && order.status !== "ISSUE" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onMarkIssue(order.id)}
          className="text-red-600"
        >
          <AlertTriangle className="w-3 h-3" />
          {t.admin.issue}
        </Button>
      )}
    </div>
  );
}
