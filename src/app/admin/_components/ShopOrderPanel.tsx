"use client";

import { useState } from "react";
import { Globe, Loader2, Mail, Truck } from "lucide-react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { isShopTestOrder } from "@/lib/shop/orderFlags";
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
    test: string;
    testTitle: string;
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
    test: "ТЕСТ",
    testTitle: "Тестовый заказ с сайта (тестовая оплата): склад не списан, можно удалить",
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
    test: "TEST",
    testTitle: "Comandă de test de pe site (plată de test): stocul nu a fost scăzut, se poate șterge",
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
    test: "TEST",
    testTitle: "Storefront test order (test payment): no stock deducted, safe to delete",
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
  paymentProvider?: string | null;
  notes?: string | null;
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

/** «Сайт» + payment state chip next to the order number (+ red «ТЕСТ» for test-payment orders). */
export function ShopOrderBadge({ order }: { order: ShopOrderFields }) {
  const l = useLabels();
  if (!isShopOrder(order)) return null;
  const ps = order.paymentStatus ?? "pending";
  const badge = (
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
  if (!isShopTestOrder(order)) return badge;
  return (
    <>
      {badge}
      <span
        className="inline-flex items-center rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
        title={l.testTitle}
      >
        {l.test}
      </span>
    </>
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

  const withEmails = (
    <>
      {content}
      {order.customerEmail ? <ShopEmailHistory orderId={order.id} /> : null}
    </>
  );
  if (as === "div") return <div className={cn("mt-2", rowClass)}>{withEmails}</div>;
  return (
    <tr className={rowClass}>
      <td colSpan={6} className="px-4 pb-2 pt-0">
        {withEmails}
      </td>
    </tr>
  );
}

const EMAIL_L: Record<Locale, { button: string; sent: string; none: string; failed: string; logged: string; tpl: Record<string, string> }> = {
  ro: {
    button: "E-mailuri",
    sent: "Email trimis",
    none: "Niciun e-mail trimis",
    failed: "eroare",
    logged: "doar în jurnal, fără Resend",
    tpl: { login: "intrare", order_received: "comandă primită", order_paid: "achitată", order_shipped: "expediată", ready_pickup: "gata de ridicare" },
  },
  ru: {
    button: "Письма",
    sent: "Письмо отправлено",
    none: "Писем не было",
    failed: "ошибка",
    logged: "только в журнале, без Resend",
    tpl: { login: "вход", order_received: "заказ принят", order_paid: "оплачен", order_shipped: "отправлен", ready_pickup: "готов к выдаче" },
  },
  en: {
    button: "E-mails",
    sent: "Email sent",
    none: "No e-mails sent",
    failed: "error",
    logged: "logged only, no Resend",
    tpl: { login: "sign-in", order_received: "order received", order_paid: "paid", order_shipped: "shipped", ready_pickup: "ready for pickup" },
  },
};

type EmailRow = {
  id: string;
  to: string;
  template: string;
  subject?: string | null;
  lang?: string | null;
  status: string; error: string | null; createdAt: string };

/** « (ошибка)» / « (только в журнале, без Resend)» after an e-mail row; empty when sent. */
export function emailStatusSuffix(status: string, l: { failed: string; logged: string }): string {
  if (status === "failed") return ` (${l.failed})`;
  if (status === "logged") return ` (${l.logged})`;
  return "";
}

/** «Email trimis: …» — the customer e-mails of a storefront order, loaded on demand. */
function ShopEmailHistory({ orderId }: { orderId: string }) {
  const lang = useLanguageStore((s) => s.locale) as Locale;
  const l = EMAIL_L[lang] ?? EMAIL_L.ru;
  const [rows, setRows] = useState<EmailRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (rows) return setRows(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/emails`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { emails?: EmailRow[] } | null;
      setRows(body?.emails ?? []);
    } catch {
      setRows([]);
    }
    setBusy(false);
  };
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
      <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" aria-hidden />}
        {l.button}
      </button>
      {rows && rows.length === 0 && <span>{l.none}</span>}
      {rows?.map((r) => (
        <span key={r.id} className={r.status === "failed" ? "text-red-600" : undefined} title={r.error ?? r.to}>
          {l.sent}: {l.tpl[r.template] ?? r.template}
          {r.lang ? ` · ${r.lang.toUpperCase()}` : ""}
          {r.subject ? <span className="text-gray-500"> · «{r.subject}»</span> : null}
          {" · "}
          {new Date(r.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
          {emailStatusSuffix(r.status, l)}
        </span>
      ))}
    </div>
  );
}
