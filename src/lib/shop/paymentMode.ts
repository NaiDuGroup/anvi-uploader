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

/**
 * Whether a real payment provider can take payments. Paynet is still a stub
 * (`paynetProvider` throws `not_configured`), so this is false until it is
 * implemented; then: `SHOP_PAYMENT_MODE=paynet` + its credentials.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- env is read once Paynet is implemented
export function isRealPaymentConfigured(_env: Env = process.env): boolean {
  return false;
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
