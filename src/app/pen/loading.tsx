/**
 * Suspense fallback for `/pen`.
 *
 * Mirrors `/mug` and `/notebook`: the home-page card switches to a pending
 * state on tap and relies on a route-scoped boundary so the spinner shows up
 * the moment navigation starts, rather than after the canvas chunks load.
 */
export default function PenLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
      <div className="app-spinner" aria-label="Loading" role="status" />
    </div>
  );
}
