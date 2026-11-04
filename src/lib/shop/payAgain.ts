import "server-only";
import { prisma } from "@/lib/prisma";
import { PaymentNotConfiguredError, resolvePaymentProvider, type StartPaymentResult } from "./payment";

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

/**
 * «Plătește acum» on the order page: start the payment again for an unpaid
 * storefront order, through the same provider choice as the checkout
 * (`resolvePaymentProvider`: Paynet when configured, else the test provider
 * when this caller may use it — in production only with a tester pass /
 * staff session).
 *
 * - 200 `{ payment: { provider, redirectUrl } }` — go there;
 * - 404 — unknown, studio or trashed order;
 * - 409 `already_paid`;
 * - 503 `payment_unavailable` — this caller cannot pay now (no provider, or a
 *   test order outside the test provider / a real order inside it);
 * - 503 `payment_not_configured` — the provider is not set up yet («în curând»).
 */
export async function restartShopPayment(
  token: string,
  locale: "ro" | "ru",
  env: Env = process.env,
  opts: { tester?: boolean } = {},
): Promise<PayAgainResponse> {
  if (!token || token.length > 64) return { status: 404, body: { error: "not_found" } };
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
    });
  } catch (e) {
    if (e instanceof PaymentNotConfiguredError) {
      return { status: 503, body: { error: "payment_not_configured", orderNumber: o.orderNumber, publicToken: o.publicToken } };
    }
    throw e;
  }
  if (started.paymentRef) {
    await prisma.order.update({ where: { id: o.id }, data: { paymentRef: started.paymentRef } });
  }
  return { status: 200, body: { payment: { provider: started.provider, redirectUrl: started.redirectUrl } } };
}
