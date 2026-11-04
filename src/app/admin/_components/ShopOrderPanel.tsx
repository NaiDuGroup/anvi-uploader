"use client";

import { useState } from "react";
import { Globe, Loader2, Truck } from "lucide-react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

/**
 * Storefront (source='shop') orders in the admin orders list: a «Сайт» badge
 * with the online payment state, and a strip with the customer, delivery and
 * the EVS tracking number + «Отправлен» action.
 */

type Locale = "ro" | "ru" | "en";

const L: Record<
  Locale,
  {
    site: string;
    payment: Record<string, string>;
    delivery: Record<string, string>;
    tracking: string;
    save: string;
    ship: string;
    shipped: string;
    unship: string;
    deliveryPrice: string;
  }
> = {
  ru: {
    site: "Сайт",
    payment: { unpaid: "не оплачен", pending: "ждёт оплаты", paid: "оплачен онлайн", failed: "оплата не прошла", refunded: "возврат" },
    delivery: { pickup: "Самовывоз", courier_chisinau: "Курьер по Кишинёву", courier_moldova: "Курьер по Молдове" },
    tracking: "Номер EVS",
    save: "Сохранить",
    ship: "Отправлен",
    shipped: "Отправлен",
    unship: "Отменить «Отправлен»",
    deliveryPrice: "доставка",
  },
  ro: {
    site: "Site",
    payment: { unpaid: "neachitat", pending: "așteaptă plata", paid: "achitat online", failed: "plată eșuată", refunded: "rambursat" },
    delivery: { pickup: "Ridicare", courier_chisinau: "Curier Chișinău", courier_moldova: "Curier Moldova" },
    tracking: "Nr. EVS",
    save: "Salvează",
    ship: "Expediat",
    shipped: "Expediat",
    unship: "Anulează «Expediat»",
    deliveryPrice: "livrare",
  },
  en: {
    site: "Site",
    payment: { unpaid: "unpaid", pending: "awaiting payment", paid: "paid online", failed: "payment failed", refunded: "refunded" },
    delivery: { pickup: "Pickup", courier_chisinau: "Courier Chișinău", courier_moldova: "Courier Moldova" },
    tracking: "EVS no.",
    save: "Save",
    ship: "Shipped",
    shipped: "Shipped",
    unship: "Undo «Shipped»",
    deliveryPrice: "delivery",
  },
};

interface ShopOrderFields {
  id: string;
  source?: string;
  paymentStatus?: string;
  customerName?: string | null;
  customerEmail?: string | null;
  phone: string;
  deliveryMethod?: string | null;
  deliveryCity?: string | null;
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
  deliveryPriceMdl?: number | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
}

function useLabels() {
  const locale = useLanguageStore((s) => s.locale) as Locale;
  return L[locale] ?? L.ru;
}

export function isShopOrder(order: { source?: string }): boolean {
  return order.source === "shop";
}

/** «Сайт» + payment state chip next to the order number. */
export function ShopOrderBadge({ order }: { order: ShopOrderFields }) {
  const l = useLabels();
  if (!isShopOrder(order)) return null;
  const ps = order.paymentStatus ?? "pending";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        ps === "paid"
          ? "bg-indigo-100 text-indigo-800"
          : ps === "failed"
            ? "bg-red-100 text-red-700"
            : "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200",
      )}
      title={l.payment[ps] ?? ps}
    >
      <Globe className="h-3 w-3" aria-hidden />
      {l.site}
      <span className="font-normal">· {l.payment[ps] ?? ps}</span>
    </span>
  );
}

/** Customer, delivery and tracking for a storefront order (table row or phone card block). */
export function ShopOrderRow({
  order,
  as = "tr",
  rowClass,
}: {
  order: ShopOrderFields;
  as?: "tr" | "div";
  rowClass?: string;
}) {
  const l = useLabels();
  const updateOrder = useOrdersStore((s) => s.updateOrder);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<"tracking" | "ship" | null>(null);
  if (!isShopOrder(order)) return null;

  const tracking = draft ?? order.trackingNumber ?? "";
  const dirty = draft != null && draft.trim() !== (order.trackingNumber ?? "");
  const isPickup = order.deliveryMethod === "pickup";

  const saveTracking = async () => {
    setSaving("tracking");
    try {
      await updateOrder(order.id, { trackingNumber: tracking.trim() || null });
      setDraft(null);
    } finally {
      setSaving(null);
    }
  };
  const toggleShipped = async () => {
    setSaving("ship");
    try {
      await updateOrder(order.id, {
        markShipped: !order.shippedAt,
        ...(dirty ? { trackingNumber: tracking.trim() || null } : {}),
      });
      setDraft(null);
    } finally {
      setSaving(null);
    }
  };

  const content = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-indigo-100 bg-indigo-50/50 px-2.5 py-1.5 text-xs text-gray-700">
      <span className="min-w-0">
        <span className="font-semibold text-gray-900">{order.customerName ?? "—"}</span>
        {order.customerEmail && <span className="ml-1.5 text-gray-500">{order.customerEmail}</span>}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1">
        <Truck className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
        <span>
          {l.delivery[order.deliveryMethod ?? ""] ?? order.deliveryMethod ?? "—"}
          {!isPickup && [order.deliveryCity, order.deliveryAddress].filter(Boolean).length > 0 && (
            <>: {[order.deliveryCity, order.deliveryAddress].filter(Boolean).join(", ")}</>
          )}
          {order.deliveryNote && <span className="text-gray-500"> ({order.deliveryNote})</span>}
          {order.deliveryPriceMdl != null && (
            <span className="text-gray-500">
              {" "}
              · {l.deliveryPrice} {order.deliveryPriceMdl} MDL
            </span>
          )}
        </span>
      </span>
      {!isPickup && (
        <span className="inline-flex items-center gap-1.5">
          <input
            value={tracking}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) void saveTracking();
            }}
            placeholder={l.tracking}
            maxLength={100}
            aria-label={l.tracking}
            className="h-7 w-40 rounded-md border border-gray-200 bg-white px-2 text-xs focus:border-indigo-400 focus:outline-none"
          />
          {dirty && (
            <button
              type="button"
              onClick={() => void saveTracking()}
              disabled={saving != null}
              className="inline-flex h-7 items-center rounded-md border border-gray-200 bg-white px-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              {saving === "tracking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : l.save}
            </button>
          )}
          <button
            type="button"
            onClick={() => void toggleShipped()}
            disabled={saving != null}
            title={order.shippedAt ? l.unship : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold disabled:opacity-60",
              order.shippedAt
                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                : "bg-indigo-600 text-white hover:bg-indigo-700",
            )}
          >
            {saving === "ship" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {order.shippedAt
              ? `${l.shipped} ${new Date(order.shippedAt).toLocaleDateString("ru-RU")}`
              : l.ship}
          </button>
        </span>
      )}
    </div>
  );

  if (as === "div") return <div className={cn("mt-2", rowClass)}>{content}</div>;
  return (
    <tr className={rowClass}>
      <td colSpan={6} className="px-4 pb-2 pt-0">
        {content}
      </td>
    </tr>
  );
}
