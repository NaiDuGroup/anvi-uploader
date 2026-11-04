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
