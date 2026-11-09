import type { ShopPaymentProvider } from "./constants";
import { isRealPaymentConfigured, isTestPaymentAllowed, type ShopPaymentOpts } from "./paymentMode";
import {
  PAYNET_ATTEMPTS,
  createPaynetOrder,
  formatPaynetRef,
  getPaynetOrder,
  isPaynetPaid,
  isPaynetReusable,
  parsePaynetOrderNumber,
  parsePaynetRef,
  paynetConfig,
  paynetOrderNumber,
  toBani,
  type PaynetConfig,
  type PaynetLang,
  type PaynetPayment,
} from "./paynet";
import type { ShopLang } from "@/lib/storefront/i18n";
import { shopOrigin } from "@/lib/storefront/shopHost";

/**
 * Payment-provider abstraction for storefront orders. Prepay only: an order
 * is created as `paymentStatus='pending'` and goes to work once paid.
 *
 * - `test`  — fake provider for the pilot (see {@link isTestPaymentEnabled}):
 *             the customer lands on `/shop/pay/test?token=…` and a button
 *             calls `POST /api/shop/pay/test`.
 * - `on_delivery` — no online payment («Оплата только при получении», see
 *             `payOnDelivery.ts`): the order goes to work at once and the
 *             customer lands on its page; paid at hand-over (staff mark it paid).
 * - `paynet` — Paynet (paynet.md) hosted card payment page, see {@link paynetProvider}
 *             and `paynet.ts`; settled by the notification route, the order page
 *             check and the reconcile cron (`paynetSettle.ts`).
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
  /** `Order.paymentRef` of the previous attempt («Plătește acum»): Paynet re-uses or replaces it. */
  previousRef?: string | null;
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
  /** `env`: the environment the provider was resolved from (default `process.env`). */
  startPayment(input: StartPaymentInput, env?: Env): Promise<StartPaymentResult>;
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

/** The order is already paid on Paynet (a «Plătește acum» after paying in another tab): settle it, do not charge again. */
export class PaymentAlreadyPaidError extends Error {
  constructor(readonly paymentRef: string) {
    super("already_paid");
    this.name = "PaymentAlreadyPaidError";
  }
}

const PAYNET_LANG: Record<ShopLang, PaynetLang> = { ro: "RO", ru: "RU", en: "EN" };
const PAYNET_TITLE: Record<ShopLang, string> = { ro: "Comanda ANVI", ru: "Заказ ANVI", en: "ANVI order" };

/** Storefront origin for the Paynet return links (`SHOP_PUBLIC_BASE_URL`, else https://anvi.md). */
function shopReturnOrigin(env: Env): string {
  const raw = env.SHOP_PUBLIC_BASE_URL?.trim();
  return raw && /^https?:\/\//.test(raw) ? raw.replace(/\/+$/, "") : shopOrigin(env);
}

/** Order page the customer comes back to from Paynet: `?pay=ok` (success) / `?pay=cancel`. */
export function paynetReturnUrl(publicToken: string, result: "ok" | "cancel", env: Env = process.env): string {
  return `${shopReturnOrigin(env)}/comanda/${encodeURIComponent(publicToken)}?pay=${result}`;
}

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstName: parts[0], ...(parts.length > 1 ? { lastName: parts.slice(1).join(" ") } : {}) };
}

export interface PaynetDeps {
  create?: typeof createPaynetOrder;
  get?: typeof getPaynetOrder;
  now?: () => Date;
}

/**
 * Registers (or re-uses) the Paynet payment of an order.
 *
 * Paynet order numbers are `base + orderNumber × 100 + attempt`. The attempt
 * starts at the previous one (`previousRef`) and moves on while Paynet holds
 * a payment for that number that cannot be used any more — expiring within
 * 10 minutes, expired, or for another amount (Paynet answers 500 for a
 * known Order with another amount). A still-valid payment for the same
 * amount is re-used (Paynet returns the same payment and signed link), so
 * the customer never has two open payments for the same order. A paid one
 * throws {@link PaymentAlreadyPaidError}.
 */
export async function startPaynetPayment(
  cfg: PaynetConfig,
  input: StartPaymentInput,
  env: Env = process.env,
  deps: PaynetDeps = {},
): Promise<StartPaymentResult> {
  const create = deps.create ?? createPaynetOrder;
  const get = deps.get ?? getPaynetOrder;
  const now = deps.now?.() ?? new Date();
  const amountBani = toBani(input.amountMdl);
  if (!(amountBani > 0)) throw new Error("paynet_invalid_amount");

  const prev = parsePaynetRef(input.previousRef);
  const prevNo = prev ? parsePaynetOrderNumber(prev.paynetOrder, cfg.orderBase) : null;
  let attempt = prevNo && prevNo.orderNumber === input.orderNumber ? prevNo.attempt : 0;

  for (let tries = 0; tries < 10 && attempt < PAYNET_ATTEMPTS; tries++, attempt++) {
    const paynetOrder = paynetOrderNumber(input.orderNumber, attempt, cfg.orderBase);
    const existing: PaynetPayment | null = await get(cfg, paynetOrder);
    if (existing && isPaynetPaid(existing)) throw new PaymentAlreadyPaidError(formatPaynetRef(paynetOrder, existing.paymentId));
    if (existing && !isPaynetReusable(existing, amountBani, now)) continue;
    const title = `${PAYNET_TITLE[input.locale] ?? PAYNET_TITLE.ro} #${input.orderNumber}`;
    const p = await create(cfg, {
      paynetOrder,
      amountBani,
      title,
      lang: PAYNET_LANG[input.locale] ?? "RO",
      successUrl: paynetReturnUrl(input.publicToken, "ok", env),
      cancelUrl: paynetReturnUrl(input.publicToken, "cancel", env),
      customer: {
        code: String(input.orderNumber),
        ...splitName(input.customer.name),
        email: input.customer.email ?? null,
        phone: input.customer.phone || null,
      },
      now,
    });
    return { provider: "paynet", redirectUrl: p.paymentLink, paymentRef: formatPaynetRef(paynetOrder, p.paymentId) };
  }
  throw new Error("paynet_no_free_order_number");
}

/** Paynet hosted payment page (config from env, see `paynet.ts`). */
export const paynetProvider: PaymentProvider = {
  name: "paynet",
  async startPayment(input, env = process.env) {
    const cfg = paynetConfig(env);
    if (!cfg) throw new PaymentNotConfiguredError("paynet_not_configured");
    return startPaynetPayment(cfg, input, env);
  },
};

/** Pay on delivery: nothing to start, the customer goes to the order page. */
export const onDeliveryPaymentProvider: PaymentProvider = {
  name: "on_delivery",
  async startPayment(input) {
    return {
      provider: "on_delivery",
      redirectUrl: `/shop/comanda/${encodeURIComponent(input.publicToken)}`,
    };
  },
};

/**
 * The provider to use for a new checkout, or null when the caller cannot pay
 * (checkout then answers 503 `payment_unavailable` BEFORE creating an order).
 * «Оплата только при получении» (`opts.payOnDelivery`) wins over everything;
 * then a configured real provider (Paynet); otherwise the test provider when
 * allowed for this caller (environment-wide, or `tester` = tester pass / staff).
 */
export function resolvePaymentProvider(
  env: Env = process.env,
  opts: ShopPaymentOpts = {},
): PaymentProvider | null {
  if (opts.payOnDelivery) return onDeliveryPaymentProvider;
  if (isRealPaymentConfigured(env)) return paynetProvider;
  if (isTestPaymentAllowed(env, opts)) return testPaymentProvider;
  return null;
}
