"use client";

import { useEffect, useState } from "react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Search,
  UserCheck,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import type { OrderStatus } from "@/lib/validations";

const STATUS_BADGE_MAP: Record<
  OrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }
> = {
  NEW: { label: "New", variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "default" },
  ASSIGNED: { label: "Assigned", variant: "secondary" },
  SENT_TO_WORKSHOP: { label: "Workshop", variant: "warning" },
  WORKSHOP_PRINTING: { label: "Printing", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  ISSUE: { label: "Issue", variant: "destructive" },
};

export default function AdminPage() {
  const { orders, loading, fetchOrders, updateOrder } = useOrdersStore();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOrders()}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {loading ? "Loading orders..." : "No orders found"}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Files</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.map((order) => {
                    const statusInfo =
                      STATUS_BADGE_MAP[order.status as OrderStatus] || {
                        label: order.status,
                        variant: "outline" as const,
                      };
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs">
                            {order.id.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{order.phone}</td>
                        <td className="px-4 py-3">
                          <span className="text-sm">
                            {order.files.length} file
                            {order.files.length !== 1 ? "s" : ""}
                          </span>
                          <div className="text-xs text-gray-500">
                            {order.files.map((f) => f.fileName).join(", ")}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusInfo.variant}>
                            {statusInfo.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {order.status === "NEW" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleTakeInWork(order.id)}
                              >
                                <UserCheck className="w-3 h-3" />
                                Take
                              </Button>
                            )}
                            {["IN_PROGRESS", "ASSIGNED"].includes(
                              order.status
                            ) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleSendToWorkshop(order.id)
                                  }
                                >
                                  <ArrowRight className="w-3 h-3" />
                                  Workshop
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleMarkReady(order.id)}
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Ready
                                </Button>
                              </>
                            )}
                            {order.status !== "READY" &&
                              order.status !== "ISSUE" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleMarkIssue(order.id)}
                                  className="text-red-600"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  Issue
                                </Button>
                              )}
                          </div>
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
