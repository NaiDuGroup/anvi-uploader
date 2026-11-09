"use client";

import { useState } from "react";
import { Globe, Loader2, Mail, MessageSquareQuote, StickyNote, Store, Truck, UserRound } from "lucide-react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { isShopTestOrder, splitShopOrderNotes } from "@/lib/shop/orderFlags";
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
    free: string;
    deliveryNote: string;
    customerComment: string;
    autoNotes: string;
    promo: string;
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
    free: "бесплатно", deliveryNote: "Комментарий к доставке", customerComment: "Комментарий клиента", autoNotes: "Автосводка с сайта",
    promo: "Промокод",
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
    free: "gratuit", deliveryNote: "Comentariu la livrare", customerComment: "Comentariul clientului", autoNotes: "Rezumat automat de pe site",
    promo: "Cod promo",
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
    free: "free", deliveryNote: "Delivery note", customerComment: "Customer comment", autoNotes: "Site auto summary",
    promo: "Promo code",
  },
};

interface ShopOrderFields {
  id: string;
  source?: string;
  paymentStatus?: string;
  paymentProvider?: string | null;
  paymentRef?: string | null;
  notes?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  phone: string;
  deliveryMethod?: string | null;
  deliveryCity?: string | null;
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
  deliveryPriceMdl?: number | null;
  promoCode?: string | null;
  promoDiscountMdl?: number | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
}

/** «Paynet #328610» for staff (Paynet support finds the payment by its id); the full ref in the tooltip. */
function paynetLabel(order: ShopOrderFields): { short: string; title: string } | null {
  if (order.paymentProvider !== "paynet") return null;
  const m = /^paynet:(\d+):(\d+)$/.exec(order.paymentRef ?? "");
  return m ? { short: `Paynet #${m[2]}`, title: `Paynet ID ${m[2]} · Order ${m[1]}` } : { short: "Paynet", title: "Paynet" };
}

/** Payment state pill colours: pill background/text/ring + the dot. */
const PAYMENT_TONE: Record<string, { pill: string; dot: string }> = {
  paid: { pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  failed: { pill: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  refunded: { pill: "bg-gray-100 text-gray-600 ring-gray-200", dot: "bg-gray-400" },
  pending: { pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
};

function useLabels() {
  const locale = useLanguageStore((s) => s.locale) as Locale;
  return L[locale] ?? L.ru;
}

export function isShopOrder(order: { source?: string }): boolean {
  return order.source === "shop";
}

/**
 * Next to the order number: a «Сайт» source pill, the payment state pill (coloured dot),
 * a quiet «Paynet #id» and the red «ТЕСТ» for test-payment orders. Each piece is
 * `whitespace-nowrap`, so in a narrow column they wrap as whole pills, never mid-phrase.
 */
export function ShopOrderBadge({ order }: { order: ShopOrderFields }) {
  const l = useLabels();
  if (!isShopOrder(order)) return null;
  const ps = order.paymentStatus ?? "pending";
  const tone = PAYMENT_TONE[ps] ?? PAYMENT_TONE.pending!;
  const pn = paynetLabel(order);
  const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none";
  return (
    <>
      <span className={cn(pill, "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200")} title={l.site}>
        <Globe className="h-3 w-3" aria-hidden />
        {l.site}
      </span>
      <span
        className={cn(
          // Wraps inside the pill when the «Заказ» column is narrow (1024px + Цех panel) instead of spilling over
          // the phone column; rounded-lg ≈ fully round on one line, soft corners on two.
          "inline-flex max-w-full items-start gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold leading-3 ring-1 ring-inset",
          tone.pill,
        )}
        title={pn ? `${l.payment[ps] ?? ps} · ${pn.title}` : (l.payment[ps] ?? ps)}
      >
        <span className={cn("mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} aria-hidden />
        <span className="min-w-0">{l.payment[ps] ?? ps}</span>
      </span>
      {pn && (
        <span className="max-w-full truncate text-[10px] tabular-nums text-gray-400" title={pn.title}>
          {pn.short}
        </span>
      )}
      {isShopTestOrder(order) && (
        <span
          className="inline-flex items-center whitespace-nowrap rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
          title={l.testTitle}
        >
          {l.test}
        </span>
      )}
    </>
  );
}

/** Customer, delivery, tracking and e-mails for a storefront order (table row or phone card block). */
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
  const emails = useEmailHistory(order.id);
  if (!isShopOrder(order)) return null;

  const tracking = draft ?? order.trackingNumber ?? "";
  const dirty = draft != null && draft.trim() !== (order.trackingNumber ?? "");
  const isPickup = order.deliveryMethod === "pickup";
  const where = isPickup ? "" : [order.deliveryCity, order.deliveryAddress].filter(Boolean).join(", ");
  const DeliveryIcon = isPickup ? Store : Truck;

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
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-1.5 text-xs text-gray-700">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden />
          <span className="max-w-[60%] shrink-0 truncate font-semibold text-gray-900">{order.customerName ?? "—"}</span>
          {order.customerEmail && (
            <a
              href={`mailto:${order.customerEmail}`}
              className="min-w-0 truncate text-gray-500 select-all hover:text-indigo-700 hover:underline"
              title={order.customerEmail}
            >
              {order.customerEmail}
            </a>
          )}
        </span>
        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
          <DeliveryIcon className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium text-gray-800">
              {l.delivery[order.deliveryMethod ?? ""] ?? order.deliveryMethod ?? "—"}
            </span>
            {where && <span className="text-gray-600"> · {where}</span>}
          </span>
          {order.deliveryPriceMdl != null && (
            <span
              className={cn(
                "whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
                order.deliveryPriceMdl === 0 ? "bg-emerald-50 text-emerald-700" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200",
              )}
              title={l.deliveryPrice}
            >
              {order.deliveryPriceMdl === 0 ? l.free : `${order.deliveryPriceMdl} MDL`}
            </span>
          )}
        </span>
        {order.promoCode && order.promoDiscountMdl != null && order.promoDiscountMdl > 0 && (
          <span className="whitespace-nowrap font-medium text-emerald-700" title={order.promoCode}>
            {l.promo} {order.promoCode}: −{order.promoDiscountMdl} MDL
          </span>
        )}
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
              className="h-7 w-36 rounded-md border border-gray-200 bg-white px-2 text-xs focus:border-indigo-400 focus:outline-none"
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
                "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-semibold disabled:opacity-60",
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
        {order.customerEmail && <EmailHistoryButton state={emails} className="ml-auto" />}
      </div>
      {order.deliveryNote && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-amber-900 ring-1 ring-inset ring-amber-200">
          <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
          <span>
            <span className="font-semibold">{l.deliveryNote}:</span> {order.deliveryNote}
          </span>
        </p>
      )}
      {order.customerEmail && <EmailHistoryList state={emails} />}
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

/**
 * The storefront checkout's auto notes («Сайт · Самовывоз / 1) Баннер … — 1 шт.») repeat the
 * lines and the delivery strip: shown as one muted line (click = edit, like the sticky note).
 * The customer's own line notes («прим.: …») and staff-added lines stay prominent.
 */
export function ShopAutoNotes({
  notes,
  onEdit,
  editTitle,
  isCard = false,
}: {
  notes: string;
  onEdit: () => void;
  editTitle: string;
  isCard?: boolean;
}) {
  const l = useLabels();
  const parts = splitShopOrderNotes(notes);
  return (
    <div className="flex flex-col gap-1">
      {parts.comments.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
          <div className="min-w-0">
            <span className="font-semibold">{l.customerComment}:</span>{" "}
            {parts.comments.map((c, i) => (
              <span key={i}>
                {i > 0 && " · "}«{c}»
              </span>
            ))}
          </div>
        </div>
      )}
      {parts.extra.length > 0 && (
        <button
          type="button"
          onClick={onEdit}
          title={editTitle}
          className="flex w-full cursor-pointer items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-left transition-colors hover:bg-amber-100"
        >
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
          <p className="flex-1 whitespace-pre-line text-xs leading-relaxed text-gray-700">{parts.extra.join("\n")}</p>
        </button>
      )}
      {parts.extra.length === 0 && (
        <button
          type="button"
          onClick={onEdit}
          title={`${l.autoNotes} — ${editTitle}\n\n${parts.summary}`}
          className={cn(
            "flex min-w-0 max-w-full items-center gap-1 self-start text-[11px] text-gray-400 transition-colors hover:text-amber-600",
            isCard && "min-h-10",
          )}
        >
          <StickyNote className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{parts.summary.replace(/\n/g, " · ")}</span>
        </button>
      )}
    </div>
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

type EmailHistoryState = ReturnType<typeof useEmailHistory>;

/** The customer e-mails of a storefront order, loaded on demand (click again = hide). */
function useEmailHistory(orderId: string) {
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
  return { rows, busy, load };
}

function useEmailLabels() {
  const lang = useLanguageStore((s) => s.locale) as Locale;
  return EMAIL_L[lang] ?? EMAIL_L.ru;
}

/** «✉ E-mailuri» on the right of the shop strip. */
function EmailHistoryButton({ state, className }: { state: EmailHistoryState; className?: string }) {
  const l = useEmailLabels();
  return (
    <button
      type="button"
      onClick={() => void state.load()}
      aria-expanded={state.rows != null}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-indigo-700 hover:underline",
        className,
      )}
    >
      {state.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" aria-hidden />}
      {l.button}
    </button>
  );
}

/** «Email trimis: …» rows under the shop strip once loaded. */
function EmailHistoryList({ state }: { state: EmailHistoryState }) {
  const l = useEmailLabels();
  const { rows } = state;
  if (!rows) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 border-t border-indigo-100 pt-1.5 text-[11px] text-gray-600">
      {rows.length === 0 && <span>{l.none}</span>}
      {rows.map((r) => (
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
