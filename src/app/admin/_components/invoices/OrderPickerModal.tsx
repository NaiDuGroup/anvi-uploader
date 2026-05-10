"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";

export interface PickerOrder {
  id: string;
  orderNumber: number;
  productType: string;
  price: number | null;
  status: string;
  createdAt: string;
  notes: string | null;
}

export interface OrderPickerPickPayload {
  id: string;
  orderNumber: number;
  productLabel: string;
  price: number | null;
}

const PRODUCT_LABELS: Record<string, { ro: string; ru: string; en: string }> = {
  paper_print: { ro: "Imprimare hârtie", ru: "Печать на бумаге", en: "Paper print" },
  mug: { ro: "Cană personalizată", ru: "Печать на кружке", en: "Custom mug" },
  notebook: { ro: "Caiet personalizat", ru: "Печать на блокноте", en: "Custom notebook" },
};

function productLabel(productType: string, locale: string): string {
  const entry = PRODUCT_LABELS[productType];
  if (!entry) return productType;
  return entry[locale as "ro" | "ru" | "en"] ?? entry.ro;
}

export default function OrderPickerModal({
  clientId,
  onClose,
  onPick,
}: {
  clientId: string;
  onClose: () => void;
  onPick: (payload: OrderPickerPickPayload) => void;
}) {
  const { t, locale } = useLanguageStore();
  const [orders, setOrders] = useState<PickerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/admin/orders/by-client?clientId=${encodeURIComponent(clientId)}`, {
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { orders: PickerOrder[] };
        setOrders(data.orders);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => ctrl.abort();
  }, [clientId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {t.invoices.fromOrderTitle}
            </h2>
            <p className="text-xs text-gray-500">{t.invoices.fromOrderHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
          {error ? (
            <p className="py-6 text-center text-sm text-red-600">{error}</p>
          ) : orders === null ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {t.invoices.listLoading}
            </p>
          ) : orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {t.invoices.fromOrderEmpty}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      № {o.orderNumber} — {productLabel(o.productType, locale)}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {o.notes ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">
                      {o.price != null ? `${o.price} MDL` : "—"}
                    </span>
                    <Button
                      size="sm"
                      onClick={() =>
                        onPick({
                          id: o.id,
                          orderNumber: o.orderNumber,
                          productLabel: productLabel(o.productType, locale),
                          price: o.price,
                        })
                      }
                    >
                      {t.invoices.fromOrderAdd}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
