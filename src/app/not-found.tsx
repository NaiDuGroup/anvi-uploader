"use client";

import Link from "next/link";
import { useLanguageStore } from "@/stores/useLanguageStore";

/**
 * 404 for print.anvi.md (uploader, admin, cabinet) in the app's style and
 * language. Storefront pages have their own (`src/app/shop/not-found.tsx`);
 * this one only shows for paths outside every route.
 */
export default function NotFound() {
  const t = useLanguageStore((s) => s.t);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center space-y-4">
        <p className="text-5xl font-bold tracking-tight text-gray-300" aria-hidden>
          404
        </p>
        <h1 className="text-lg font-semibold text-gray-900">{t.common.notFoundTitle}</h1>
        <p className="text-sm text-gray-500">{t.common.notFoundText}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          {t.common.goHome}
        </Link>
      </div>
    </div>
  );
}
