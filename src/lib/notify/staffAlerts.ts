import "server-only";
import { prisma } from "@/lib/prisma";
import { loadShopOrderView, shopLineDescriber } from "@/lib/shop/orders";
import { loadShopLineLabels } from "@/lib/storefront/lineLabelsServer";
import { PRINT_ORIGIN } from "@/lib/storefront/shopHost";
import {
  CORPORATE_INTEREST_RU,
  CORPORATE_QUANTITY_LABEL,
  readCorporateFiles,
  type CorporateInterest,
  type CorporateQuantity,
} from "@/lib/corporate/requestRules";
import {
  formatCorporateRequest,
  formatShopOrderCreated,
  formatShopOrderOnDelivery,
  formatShopOrderPaid,
  sendTelegram,
  telegramUnpaidOrdersEnabled,
  type ShopOrderAlert,
} from "./telegram";

/**
 * Staff Telegram alerts for storefront events. Every function swallows its
 * errors (logged); call them after the response (`runAfter`). Duplicates are
 * prevented by the callers: «paid» fires only on the call that settled the
 * order (`markShopOrderPaid` → "paid"), «created» once per checkout.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Staff admin origin for links: `ADMIN_PUBLIC_BASE_URL`, else https://print.anvi.md. */
export function adminPublicOrigin(env: Env = process.env): string {
  const raw = env.ADMIN_PUBLIC_BASE_URL?.trim();
  return raw && /^https?:\/\//.test(raw) ? raw.replace(/\/+$/, "") : PRINT_ORIGIN;
}

async function shopOrderAlert(
  where: { id: string } | { publicToken: string },
): Promise<(ShopOrderAlert & { payOnDelivery: boolean }) | null> {
  const o = await prisma.order.findUnique({
    where,
    select: {
      id: true,
      source: true,
      deletedAt: true,
      publicToken: true,
      orderNumber: true,
      phone: true,
      customerName: true,
      deliveryCity: true,
      promoCode: true,
      promoDiscountMdl: true,
      paymentProvider: true,
    },
  });
  if (!o || o.source !== "shop" || o.deletedAt) return null;
  // Line names in Russian from the live catalog (the stored text otherwise).
  const labels = await loadShopLineLabels("ru").catch(() => null);
  const view = await loadShopOrderView(o.publicToken, labels ? shopLineDescriber(labels, "ru") : undefined);
  if (!view) return null;
  return {
    orderNumber: o.orderNumber,
    total: view.total,
    deliveryMethod: view.delivery.method,
    deliveryCity: o.deliveryCity,
    customerName: o.customerName,
    phone: o.phone,
    promoCode: o.promoCode,
    promoDiscount: o.promoDiscountMdl == null ? null : Number(o.promoDiscountMdl),
    lines: view.lines.map((l) => ({ title: l.title, optionsText: l.optionsText, quantity: l.quantity, noQty: l.noQty })),
    adminUrl: `${adminPublicOrigin()}/admin/orders/${o.id}`,
    payOnDelivery: o.paymentProvider === "on_delivery",
  };
}

/** «Оплачен заказ с сайта» — by the order's public token (payment callbacks). */
export async function alertShopOrderPaid(publicToken: string): Promise<void> {
  try {
    const a = await shopOrderAlert({ publicToken });
    if (a) await sendTelegram(formatShopOrderPaid(a));
  } catch (e) {
    console.error("[staff-alert] paid order alert failed:", e);
  }
}

/**
 * «Новый заказ с сайта»: always for a pay-on-delivery order (it goes straight
 * to work, there is no «paid» alert to wait for); an unpaid online order only
 * with `TELEGRAM_ALERT_UNPAID_ORDERS` on.
 */
export async function alertShopOrderCreated(orderId: string, env: Env = process.env): Promise<void> {
  try {
    const a = await shopOrderAlert({ id: orderId });
    if (!a) return;
    if (a.payOnDelivery) await sendTelegram(formatShopOrderOnDelivery(a));
    else if (telegramUnpaidOrdersEnabled(env)) await sendTelegram(formatShopOrderCreated(a));
  } catch (e) {
    console.error("[staff-alert] new order alert failed:", e);
  }
}

/** «Заявка компании». */
export async function alertCorporateRequest(id: string): Promise<void> {
  try {
    const r = await prisma.corporateRequest.findUnique({ where: { id } });
    if (!r) return;
    const products = r.products.map((p) =>
      p === "other" && r.productsOther ? `Другое: ${r.productsOther}` : (CORPORATE_INTEREST_RU[p as CorporateInterest] ?? p),
    );
    await sendTelegram(
      formatCorporateRequest({
        number: r.number,
        companyName: r.companyName,
        contactName: r.contactName,
        phone: r.phone,
        email: r.email,
        products,
        quantity: CORPORATE_QUANTITY_LABEL[r.quantity as CorporateQuantity] ?? r.quantity,
        deadline: r.deadline.toISOString().slice(0, 10).split("-").reverse().join("."),
        budget: r.budget,
        hasLogo: r.hasLogo,
        fileCount: readCorporateFiles(r.files).length,
        message: r.message,
        adminUrl: `${adminPublicOrigin()}/admin/shop/corporate-requests/${r.id}`,
      }),
    );
  } catch (e) {
    console.error("[staff-alert] corporate request alert failed:", e);
  }
}
