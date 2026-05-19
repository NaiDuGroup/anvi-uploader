/**
 * Suspense fallback for `/admin/orders/[id]/edit`.
 *
 * Without this file Next.js streams the edit RSC silently — the
 * server has to await `loadWizardBootstrap` plus a session lookup,
 * which can take 0.5-1.5 s on prod against Neon, and the user just
 * stares at the orders list with no indication that the click was
 * received. By placing this file we give Next.js a Suspense
 * boundary scoped exactly to the edit route, so the new URL renders
 * an immediate spinner while the page payload streams.
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
