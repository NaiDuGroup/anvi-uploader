/**
 * Suspense fallback for `/mug`.
 *
 * The mug wizard pulls in the 3D preview (Three.js + R3F) plus the
 * canvas rendering helpers, so the first paint can take a couple of
 * seconds. Without this file the home-page card stays selected and the
 * viewport shows nothing, leaving the user to wonder if their tap was
 * registered. A route-scoped loading.tsx gives Next.js a Suspense
 * boundary on the new URL so the spinner appears as soon as the
 * navigation starts.
 */
export default function MugLoading() {
  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
      <div className="app-spinner" aria-label="Loading" role="status" />
    </div>
  );
}
