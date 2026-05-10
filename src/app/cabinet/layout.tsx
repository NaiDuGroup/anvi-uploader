import type { ReactNode } from "react";

/**
 * Cabinet routes intentionally do NOT enforce session in this layout.
 * The middleware (`src/middleware.ts`) gates everything under `/cabinet`
 * except `/cabinet/login` and `/cabinet/register`. This keeps the layout
 * itself rendering without an extra DB round-trip for the public routes,
 * while protected sub-routes still require a valid `customer_session` cookie.
 */
export default function CabinetLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-gray-50 text-gray-900">{children}</div>;
}
