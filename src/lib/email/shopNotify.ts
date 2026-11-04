import "server-only";
import { prisma } from "@/lib/prisma";
import { issueShopLoginToken } from "@/lib/shop/account/customers";
import { shopSessionSecret, SHOP_LOGIN_TTL_MS } from "@/lib/shop/account/tokens";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { formatPrice } from "@/lib/storefront/format";
import { parseShopLang, type ShopLang } from "@/lib/storefront/i18n";
import { shopOrigin } from "@/lib/storefront/shopHost";
import { sendEmail } from "./send";
import type { ShopOrderEvent } from "./shopEvents";
import { renderShopEmail, type ShopEmailTemplate } from "./templates";

export { adminUpdateShopEvents, type ShopOrderEvent } from "./shopEvents";

/**
 * Storefront customer notifications. All functions swallow their errors
 * (logged): a mail problem never breaks checkout, payment or the admin.
 * Call them after the response (`after()` in route handlers).
 */

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Absolute storefront origin for links in e-mails: `SHOP_PUBLIC_BASE_URL`
 * (e.g. http://shop.localhost:3000 locally), else https://<primary shop host>.
 * It must be a shop host (clean URLs: /cont, /comanda/…).
 */
export function shopPublicOrigin(env: Env = process.env): string {
  const raw = env.SHOP_PUBLIC_BASE_URL?.trim();
  return raw && /^https?:\/\//.test(raw) ? raw.replace(/\/+$/, "") : shopOrigin(env);
}

export function shopLoginUrl(token: string, env: Env = process.env): string {
  return `${shopPublicOrigin(env)}/cont/verifica?token=${encodeURIComponent(token)}`;
}

export function shopOrderUrl(publicToken: string, env: Env = process.env): string {
  return `${shopPublicOrigin(env)}/comanda/${encodeURIComponent(publicToken)}`;
}

/** Login e-mail with the link + code. */
export async function sendShopLoginEmail(opts: { email: string; token: string; code: string; lang: ShopLang; customerId?: string | null }) {
  try {
    const r = renderShopEmail("login", opts.lang, {
      origin: shopPublicOrigin(),
      loginUrl: shopLoginUrl(opts.token),
      code: opts.code,
      ttlMinutes: Math.round(SHOP_LOGIN_TTL_MS / 60000),
    });
    await sendEmail({ to: opts.email, ...r, template: "login", lang: opts.lang, shopCustomerId: opts.customerId ?? null });
  } catch (e) {
    console.error("[shop-notify] login e-mail failed:", e);
  }
}


const TEMPLATE: Record<ShopOrderEvent, ShopEmailTemplate> = {
  created: "order_received",
  paid: "order_paid",
  shipped: "order_shipped",
  ready: "ready_pickup",
};

/**
 * One order e-mail to the checkout address, in the checkout language.
 * Skipped for orders without an e-mail, studio orders and trashed orders;
 * `paid` / `ready` / `created` go once per order (by `email_log`), `shipped`
 * again only with `force` (the tracking number arrived after the first one).
 */
export async function notifyShopOrder(orderId: string, event: ShopOrderEvent, opts: { force?: boolean } = {}): Promise<void> {
  try {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        source: true,
        deletedAt: true,
        orderNumber: true,
        publicToken: true,
        price: true,
        customerEmail: true,
        customerName: true,
        shopLocale: true,
        shopCustomerId: true,
        trackingNumber: true,
        deliveryMethod: true,
      },
    });
    if (!o || o.source !== "shop" || o.deletedAt || !o.customerEmail) return;
    if (event === "ready" && o.deliveryMethod !== "pickup") return;
    const template = TEMPLATE[event];
    if (!opts.force) {
      const sent = await prisma.emailLog.findFirst({
        where: { orderId: o.id, template, status: { in: ["sent", "logged"] } },
        select: { id: true },
      });
      if (sent) return;
    }
    const lang = parseShopLang(o.shopLocale);
    let loginUrl: string | undefined;
    const secret = shopSessionSecret();
    if (event === "created" && o.shopCustomerId && secret) {
      const issued = await issueShopLoginToken(o.customerEmail, secret, { purpose: "order", customerId: o.shopCustomerId });
      loginUrl = shopLoginUrl(issued.token);
    }
    const pickupAddress = event === "ready" ? (await loadShopContacts()).address : null;
    const r = renderShopEmail(template, lang, {
      origin: shopPublicOrigin(),
      name: o.customerName,
      orderNumber: o.orderNumber,
      total: o.price != null ? formatPrice(Number(o.price.toString()), lang) : undefined,
      orderUrl: shopOrderUrl(o.publicToken),
      loginUrl,
      trackingNumber: o.trackingNumber,
      pickupAddress,
    });
    await sendEmail({
      to: o.customerEmail,
      ...r,
      template,
      lang,
      orderId: o.id,
      shopCustomerId: o.shopCustomerId,
    });
  } catch (e) {
    console.error(`[shop-notify] ${event} e-mail for order ${orderId} failed:`, e);
  }
}

/** {@link notifyShopOrder} by the order's public token (payment callbacks). */
export async function notifyShopOrderByToken(publicToken: string, event: ShopOrderEvent): Promise<void> {
  try {
    const o = await prisma.order.findUnique({ where: { publicToken }, select: { id: true } });
    if (o) await notifyShopOrder(o.id, event);
  } catch (e) {
    console.error(`[shop-notify] ${event} e-mail by token failed:`, e);
  }
}
