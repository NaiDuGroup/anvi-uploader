type Env = Readonly<Record<string, string | undefined>>;

/**
 * Whether the fake `test` payment provider may run (checkout redirects to
 * `/shop/pay/test` and `POST /api/shop/pay/test` marks orders paid).
 *
 * - `SHOP_PAYMENT_MODE=test` → always on (explicit opt-in, even in production);
 * - Vercel production (`VERCEL_ENV=production`) → off;
 * - Vercel preview deployments → on (the owner tests the branch there);
 * - local dev (`NODE_ENV !== "production"`) → on;
 * - anything else (a self-hosted production build) → off.
 */
export function isTestPaymentEnabled(env: Env = process.env): boolean {
  if (env.SHOP_PAYMENT_MODE?.trim() === "test") return true;
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview") return true;
  return env.NODE_ENV !== "production";
}

/** Env vars Paynet needs (kept in sync with `PAYNET_REQUIRED_ENV` in `paynet.ts`, which is server-only). */
const PAYNET_ENV = [
  "PAYNET_API_URL",
  "PAYNET_USERNAME",
  "PAYNET_PASSWORD",
  "PAYNET_SALE_AREA_CODE",
  "PAYNET_MERCHANT_CODE",
  "PAYNET_NOTIFICATION_SECRET",
] as const;

/**
 * Whether a real payment provider can take payments: `SHOP_PAYMENT_MODE=paynet`
 * and every Paynet credential set. It then wins over the test provider,
 * also for testers (see `resolvePaymentProvider`).
 */
export function isRealPaymentConfigured(env: Env = process.env): boolean {
  if (env.SHOP_PAYMENT_MODE?.trim() !== "paynet") return false;
  return PAYNET_ENV.every((k) => !!env[k]?.trim());
}

/**
 * How a storefront visitor can pay right now:
 * - `real`   — a real provider is configured;
 * - `test`   — the fake provider is on for everyone (previews, local dev, `SHOP_PAYMENT_MODE=test`);
 * - `tester` — only because the caller holds a tester pass / staff session (production);
 * - `unavailable` — no way to pay: checkout refuses before creating an order.
 */
export type ShopPaymentState = "real" | "test" | "tester" | "unavailable";

export function shopPaymentState(env: Env = process.env, opts: { tester?: boolean } = {}): ShopPaymentState {
  if (isRealPaymentConfigured(env)) return "real";
  if (isTestPaymentEnabled(env)) return "test";
  if (opts.tester) return "tester";
  return "unavailable";
}

/** The fake `test` payment may be used by this caller (environment-wide or via a tester pass). */
export function isTestPaymentAllowed(env: Env = process.env, opts: { tester?: boolean } = {}): boolean {
  const s = shopPaymentState(env, opts);
  return s === "test" || s === "tester";
}
