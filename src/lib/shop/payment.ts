import type { ShopPaymentProvider } from "./constants";
import { isRealPaymentConfigured, isTestPaymentAllowed } from "./paymentMode";
import type { ShopLang } from "@/lib/storefront/i18n";

/**
 * Payment-provider abstraction for storefront orders. Prepay only: an order
 * is created as `paymentStatus='pending'` and goes to work once paid.
 *
 * - `test`  — fake provider for the pilot (see {@link isTestPaymentEnabled}):
 *             the customer lands on `/shop/pay/test?token=…` and a button
 *             calls `POST /api/shop/pay/test`.
 * - `paynet` — Paynet (paynet.md) hosted payment page. NOT IMPLEMENTED yet:
 *             credentials are not available. See {@link paynetProvider}.
 */

type Env = Readonly<Record<string, string | undefined>>;

export class PaymentNotConfiguredError extends Error {
  readonly code = "not_configured" as const;
  constructor(message = "not_configured") {
    super(message);
    this.name = "PaymentNotConfiguredError";
  }
}

export interface StartPaymentInput {
  orderId: string;
  orderNumber: number;
  publicToken: string;
  /** Amount to charge, MDL (subtotal + delivery). */
  amountMdl: number;
  customer: { name: string; phone: string; email?: string | null };
  locale: ShopLang;
  /** Short description for the payment page. */
  description: string;
}

export interface StartPaymentResult {
  provider: ShopPaymentProvider;
  /** Where the browser goes next (relative for `test`, absolute for Paynet). */
  redirectUrl: string;
  /** Provider's payment id, when known at start (stored in `Order.paymentRef`). */
  paymentRef?: string;
}

export interface PaymentProvider {
  readonly name: ShopPaymentProvider;
  startPayment(input: StartPaymentInput): Promise<StartPaymentResult>;
}

export const testPaymentProvider: PaymentProvider = {
  name: "test",
  async startPayment(input) {
    return {
      provider: "test",
      redirectUrl: `/shop/pay/test?token=${encodeURIComponent(input.publicToken)}`,
    };
  },
};

/**
 * Paynet stub. TODO(paynet), once the merchant account is ready:
 * - env: `PAYNET_MERCHANT_CODE`, `PAYNET_SECRET_KEY` (signature), `PAYNET_USER` /
 *   `PAYNET_PASSWORD` if the API token flow is used, `PAYNET_API_URL`
 *   (test vs live), `SHOP_PUBLIC_BASE_URL` (e.g. https://anvi.md) for
 *   the return / cancel URLs;
 * - startPayment: register the payment (ExternalID = orderNumber, amount in
 *   bani, currency 498 MDL, customer, lines, ExpiryDate), sign it and return
 *   the hosted form URL as `redirectUrl` + the Paynet payment id as `paymentRef`;
 * - callback route (e.g. `POST /api/shop/pay/paynet/callback`, the URL given
 *   to Paynet as the notification URL): verify the signature, then mark the
 *   order paid exactly like `markShopOrderPaid` (idempotent), or `failed`.
 */
export const paynetProvider: PaymentProvider = {
  name: "paynet",
  async startPayment() {
    throw new PaymentNotConfiguredError("paynet_not_configured");
  },
};

/**
 * The provider to use for a new checkout, or null when the caller cannot pay
 * (checkout then answers 503 `payment_unavailable` BEFORE creating an order).
 * A configured real provider (Paynet) wins; otherwise the test provider when
 * allowed for this caller (environment-wide, or `tester` = tester pass / staff).
 */
export function resolvePaymentProvider(
  env: Env = process.env,
  opts: { tester?: boolean } = {},
): PaymentProvider | null {
  if (isRealPaymentConfigured(env)) return paynetProvider;
  if (isTestPaymentAllowed(env, opts)) return testPaymentProvider;
  return null;
}
