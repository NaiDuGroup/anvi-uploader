/**
 * Suspense fallback for `/notebook`.
 *
 * Mirrors `/mug/loading.tsx` — the notebook editor ships the same
 * heavy Three.js / canvas chunks, so the public page can be slow to
 * first paint. Showing a spinner immediately on navigation tells the
 * user the click registered.
 */
export default function NotebookLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
      <div className="app-spinner" aria-label="Loading" role="status" />
    </div>
  );
}
