/**
 * Staff alerts in a Telegram chat (Bot API `sendMessage`, plain `fetch`).
 *
 * Env: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_STAFF_CHAT_ID` (see
 * docs/telegram-alerts.md). Without them a message is only logged and counts
 * as sent, like the e-mail module. `sendTelegram` never throws: alerts must
 * not break checkout, payment or the corporate form — call it after the
 * response (`runAfter`). Message formatters are pure (unit-tested) and write
 * Russian text with Telegram HTML markup.
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface TelegramResult {
  status: "sent" | "logged" | "failed";
  error?: string;
}

export interface TelegramDeps {
  env?: Env;
  fetch?: typeof fetch;
  console?: Pick<Console, "info" | "error">;
}

export function telegramConfigured(env: Env = process.env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_STAFF_CHAT_ID?.trim());
}

/** What the admin «Уведомления» section shows (never the token). */
export function telegramStatus(env: Env = process.env): {
  configured: boolean;
  hasToken: boolean;
  chatId: string | null;
  unpaidOrders: boolean;
} {
  const chat = env.TELEGRAM_STAFF_CHAT_ID?.trim() || null;
  return {
    configured: telegramConfigured(env),
    hasToken: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()),
    chatId: chat,
    unpaidOrders: telegramUnpaidOrdersEnabled(env),
  };
}

/** «New unpaid shop order» alerts: off unless `TELEGRAM_ALERT_UNPAID_ORDERS` is 1 / true / yes / on. */
export function telegramUnpaidOrdersEnabled(env: Env = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.TELEGRAM_ALERT_UNPAID_ORDERS?.trim() ?? "");
}

const TIMEOUT_MS = 8000;
/** Telegram's limit is 4096 characters per message. */
export const TELEGRAM_MAX_LENGTH = 4000;

/** Send one HTML message to the staff chat. Never throws. */
export async function sendTelegram(html: string, deps: TelegramDeps = {}): Promise<TelegramResult> {
  const env = deps.env ?? process.env;
  const out = deps.console ?? console;
  const text = html.length > TELEGRAM_MAX_LENGTH ? `${html.slice(0, TELEGRAM_MAX_LENGTH)}…` : html;
  if (!telegramConfigured(env)) {
    out.info(`[telegram] (not configured) ${text.replace(/<[^>]+>/g, "")}`);
    return { status: "logged" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const doFetch = deps.fetch ?? fetch;
    const res = await doFetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN!.trim()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_STAFF_CHAT_ID!.trim(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: ctrl.signal,
    });
    if (res.ok) return { status: "sent" };
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    const error = `${res.status} ${body?.description ?? ""}`.trim().slice(0, 300);
    out.error(`[telegram] send failed: ${error}`);
    return { status: "failed", error };
  } catch (e) {
    // Never log the URL: it holds the bot token.
    const error = (e instanceof Error ? e.name : String(e)).slice(0, 300);
    out.error(`[telegram] send failed: ${error}`);
    return { status: "failed", error };
  } finally {
    clearTimeout(timer);
  }
}

// ── Formatting (pure) ────────────────────────────────────────────────────────

export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const e = escapeTelegramHtml;

/** «1 234,50 лей». */
export function formatMdlRu(n: number): string {
  const s = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `${s.replace(/ /g, " ")} лей`;
}

export const DELIVERY_RU: Record<string, string> = {
  pickup: "Самовывоз из мастерской",
  courier_chisinau: "Курьер по Кишинёву",
  courier_moldova: "Курьер по Молдове (EVS)",
};

export interface ShopOrderAlert {
  orderNumber: number;
  total: number;
  deliveryMethod: string | null;
  deliveryCity?: string | null;
  customerName?: string | null;
  phone?: string | null;
  /** Promo code applied at checkout and its discount, lei (the total is already discounted). */
  promoCode?: string | null;
  promoDiscount?: number | null;
  lines: { title: string; optionsText?: string; quantity: number; noQty?: boolean }[];
  adminUrl: string;
}

const MAX_LINES = 10;

function linesSummary(lines: ShopOrderAlert["lines"]): string[] {
  const shown = lines.slice(0, MAX_LINES).map((l) => {
    const qty = l.noQty || !l.quantity ? "" : ` × ${l.quantity}`;
    const opts = l.optionsText ? ` (${e(l.optionsText)})` : "";
    return `• ${e(l.title)}${opts}${qty}`;
  });
  if (lines.length > MAX_LINES) shown.push(`…и ещё ${lines.length - MAX_LINES}`);
  return shown;
}

function shopOrderBody(o: ShopOrderAlert): string[] {
  const delivery = o.deliveryMethod ? (DELIVERY_RU[o.deliveryMethod] ?? o.deliveryMethod) : "—";
  const rows = [
    `Сумма: <b>${e(formatMdlRu(o.total))}</b>`,
    ...(o.promoCode?.trim()
      ? [`Промокод: <b>${e(o.promoCode.trim())}</b>${o.promoDiscount && o.promoDiscount > 0 ? `, скидка −${e(formatMdlRu(o.promoDiscount))}` : ""}`]
      : []),
    `Доставка: ${e(delivery)}${o.deliveryCity && o.deliveryMethod !== "pickup" ? `, ${e(o.deliveryCity)}` : ""}`,
  ];
  const who = [o.customerName?.trim(), o.phone?.trim()].filter(Boolean).join(", ");
  if (who) rows.push(`Клиент: ${e(who)}`);
  if (o.lines.length) rows.push("", "Товары:", ...linesSummary(o.lines));
  rows.push("", `<a href="${e(o.adminUrl)}">Открыть в админке</a>`);
  return rows;
}

/** «💰 Оплачен заказ с сайта № 123». */
export function formatShopOrderPaid(o: ShopOrderAlert): string {
  return [`💰 <b>Оплачен заказ с сайта № ${o.orderNumber}</b>`, ...shopOrderBody(o)].join("\n");
}

/** «🛒 Новый заказ с сайта № 123 (не оплачен)». */
export function formatShopOrderCreated(o: ShopOrderAlert): string {
  return [`🛒 <b>Новый заказ с сайта № ${o.orderNumber}</b> (ещё не оплачен)`, ...shopOrderBody(o)].join("\n");
}

/** «🛒 Новый заказ с сайта № 123 — оплата при получении» (goes straight to work). */
export function formatShopOrderOnDelivery(o: ShopOrderAlert): string {
  return [`🛒 <b>Новый заказ с сайта № ${o.orderNumber}</b> — оплата при получении`, ...shopOrderBody(o)].join("\n");
}

export interface CorporateRequestAlert {
  number: number;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  products: string[];
  quantity: string;
  deadline: string;
  budget?: string | null;
  hasLogo: boolean;
  fileCount: number;
  message?: string | null;
  adminUrl: string;
}

/** «🏢 Заявка компании № 12». */
export function formatCorporateRequest(r: CorporateRequestAlert): string {
  const msg = r.message?.trim();
  const rows = [
    `🏢 <b>Заявка компании № ${r.number}</b>`,
    `Компания: <b>${e(r.companyName)}</b>`,
    `Контакт: ${[r.contactName, r.phone, r.email].filter((v) => v.trim()).map(e).join(", ")}`,
    `Интересует: ${e(r.products.join(", ") || "—")}`,
    `Тираж: ${e(r.quantity)}`,
    `Срок: ${e(r.deadline)}`,
  ];
  if (r.budget?.trim()) rows.push(`Бюджет: ${e(r.budget.trim())}`);
  rows.push(`Логотип: ${r.hasLogo ? "есть" : "нет"}${r.fileCount ? ` · файлов: ${r.fileCount}` : ""}`);
  if (msg) rows.push("", e(msg.length > 600 ? `${msg.slice(0, 600)}…` : msg));
  rows.push("", `<a href="${e(r.adminUrl)}">Открыть заявку</a>`);
  return rows.join("\n");
}

export function formatTelegramTest(by: string, at: Date = new Date()): string {
  const when = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Chisinau",
    dateStyle: "short",
    timeStyle: "short",
  }).format(at);
  return `✅ <b>Тест уведомлений ANVI</b>\nОтправил: ${e(by)}\n${e(when)}`;
}
