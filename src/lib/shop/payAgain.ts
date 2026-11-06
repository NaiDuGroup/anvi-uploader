import "server-only";
import { prisma } from "@/lib/prisma";
import { PaymentAlreadyPaidError, PaymentNotConfiguredError, resolvePaymentProvider, type StartPaymentResult } from "./payment";
import { syncPaynetOrderByToken } from "./paynetSettle";
import { parseShopLang, type ShopLang } from "@/lib/storefront/i18n";
import { SHOP_LEGAL_VERSION } from "@/lib/storefront/legalTexts.generated";

type Env = Readonly<Record<string, string | undefined>>;

export interface PayAgainResponse {
  status: number;
  body: Record<string, unknown>;
}

function num(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Request body of `POST /api/shop/order/[token]/pay`: `{ locale?, acceptTerms? }`; anything else is ignored. */
export function parsePayAgainBody(raw: unknown): { locale: ShopLang; acceptTerms: boolean } {
  const o = raw && typeof raw === "object" ? (raw as { locale?: unknown; acceptTerms?: unknown }) : {};
  return {
    locale: typeof o.locale === "string" ? parseShopLang(o.locale) : "ro",
    acceptTerms: o.acceptTerms === true,
  };
}

/**
 * «Plătește acum» on the order page: start the payment again for an unpaid
 * storefront order, through the same provider choice as the checkout
 * (`resolvePaymentProvider`: Paynet when configured, else the test provider
 * when this caller may use it — in production only with a tester pass /
 * staff session).
 *
 * The customer ticks the terms checkbox again (`opts.acceptTerms`); the
 * consent proof (`consentAt`, `consentVersion`) is refreshed on success.
 *
 * - 200 `{ payment: { provider, redirectUrl } }` — go there;
 * - 400 `terms_required` — the checkbox was not ticked;
 * - 404 — unknown, studio or trashed order;
 * - 409 `already_paid`;
 * - 503 `payment_unavailable` — this caller cannot pay now (no provider, or a
 *   test order outside the test provider / a real order inside it);
 * - 503 `payment_not_configured` — the provider is not set up yet («în curând»).
 */
export async function restartShopPayment(
  token: string,
  locale: ShopLang,
  env: Env = process.env,
  opts: { tester?: boolean; acceptTerms?: boolean } = {},
): Promise<PayAgainResponse> {
  if (!token || token.length > 64) return { status: 404, body: { error: "not_found" } };
  if (opts.acceptTerms !== true) return { status: 400, body: { error: "terms_required" } };
  const o = await prisma.order.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      orderNumber: true,
      publicToken: true,
      source: true,
      deletedAt: true,
      paymentStatus: true,
      isPaid: true,
      paymentProvider: true,
      paymentRef: true,
      price: true,
      phone: true,
      customerName: true,
      clientName: true,
      customerEmail: true,
    },
  });
  if (!o || o.source !== "shop" || o.deletedAt) return { status: 404, body: { error: "not_found" } };
  if (o.paymentStatus === "paid" || o.isPaid) return { status: 409, body: { error: "already_paid" } };

  const provider = resolvePaymentProvider(env, { tester: opts.tester });
  if (!provider) return { status: 503, body: { error: "payment_unavailable" } };
  // A test order is only ever settled by the test provider, and the test provider settles nothing else.
  if ((provider.name === "test") !== (o.paymentProvider === "test")) {
    return { status: 503, body: { error: "payment_unavailable" } };
  }

  let started: StartPaymentResult;
  try {
    started = await provider.startPayment({
      orderId: o.id,
      orderNumber: o.orderNumber,
      publicToken: o.publicToken,
      amountMdl: num(o.price),
      customer: { name: o.customerName ?? o.clientName ?? "", phone: o.phone, email: o.customerEmail },
      locale,
      description: `ANVI #${o.orderNumber}`,
      previousRef: o.paymentRef,
    }, env);
  } catch (e) {
    if (e instanceof PaymentAlreadyPaidError) {
      // Paid meanwhile (another tab, a late notification): settle it instead of charging again.
      await prisma.order.update({ where: { id: o.id }, data: { paymentRef: e.paymentRef } });
      await syncPaynetOrderByToken(o.publicToken);
      return { status: 409, body: { error: "already_paid" } };
    }
    if (e instanceof PaymentNotConfiguredError) {
      return { status: 503, body: { error: "payment_not_configured", orderNumber: o.orderNumber, publicToken: o.publicToken } };
    }
    throw e;
  }
  await prisma.order.update({
    where: { id: o.id },
    data: {
      consentAt: new Date(),
      consentVersion: SHOP_LEGAL_VERSION,
      ...(started.paymentRef ? { paymentRef: started.paymentRef } : {}),
      // A new attempt after Paynet's FAIL waits for its result again.
      ...(o.paymentStatus === "failed" ? { paymentStatus: "pending" } : {}),
    },
  });
  return { status: 200, body: { payment: { provider: started.provider, redirectUrl: started.redirectUrl } } };
}
