/**
 * Suspense fallback for `/admin/orders/[id]/edit`.
 *
 * The RSC for this route is now thin (just `getSessionUser()` and a role
 * check — see `page.tsx`), but this file still gives Next.js a Suspense
 * boundary scoped exactly to the edit route so the URL change shows an
 * immediate spinner instead of leaving the user staring at the orders
 * list. Once the client mounts, `NewOrderPageClient` takes over and shows
 * its own loading skeleton while it fetches wizard bootstrap data via
 * `/api/admin/wizard-bootstrap`.
 */
export default function AdminEditOrderLoading() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "60vh" }}
    >
      <div className="app-spinner" />
    </div>
  );
}
