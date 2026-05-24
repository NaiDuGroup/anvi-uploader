"use client";

/**
 * Lightweight placeholder rendered while admin client pages fetch their
 * initial payload over the network. The admin section opted out of
 * Server-Component data fetching (see `src/app/admin/(protected)/**`) to
 * eliminate the SSR/CSR divergence problem where filters stored only in
 * `localStorage` could not be honoured by the first paint. The trade-off
 * is a short loading state, and this component renders it consistently
 * across all admin pages.
 *
 * Variants map roughly to the structural shape each page uses so the
 * skeleton doesn't reflow drastically when real data lands:
 * - `table`   list-style pages (orders).
 * - `form`    settings / wizard-style edit forms.
 * - `detail`  single-record pages with a header + body layout (invoice detail).
 */

type Variant = "table" | "form" | "detail";

interface PageSkeletonProps {
  readonly variant?: Variant;
  /** Override the row/section count for the chosen variant. */
  readonly rows?: number;
  readonly className?: string;
}

export function PageSkeleton({
  variant = "table",
  rows,
  className,
}: PageSkeletonProps) {
  const wrapperClass = ["mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5", className]
    .filter(Boolean)
    .join(" ");

  if (variant === "table") {
    const count = rows ?? 6;
    return (
      <main className={wrapperClass} aria-busy="true" aria-live="polite">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-9 w-36 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-28 animate-pulse rounded-md bg-gray-100"
            />
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
          </div>
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-0"
            >
              <div className="h-5 w-24 animate-pulse rounded-full bg-gray-100" />
              <div className="h-3 w-12 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
              <div className="h-7 flex-1 animate-pulse rounded bg-gray-50" />
              <div className="h-3 w-10 animate-pulse rounded bg-gray-100" />
              <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (variant === "detail") {
    return (
      <main className={wrapperClass} aria-busy="true" aria-live="polite">
        <div className="mb-3 h-4 w-32 animate-pulse rounded bg-gray-100" />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-7 w-64 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 animate-pulse rounded bg-gray-200" />
            <div className="h-9 w-28 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white" />
            <div className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          </div>
          <aside className="space-y-3">
            <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white" />
            <div className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          </aside>
        </div>
      </main>
    );
  }

  const sections = rows ?? 3;
  return (
    <main className={wrapperClass} aria-busy="true" aria-live="polite">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: sections }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="mb-4 h-5 w-40 animate-pulse rounded bg-gray-200" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
                  <div className="h-9 w-full animate-pulse rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default PageSkeleton;
