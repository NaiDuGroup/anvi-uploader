"use client";

import Link from "next/link";
import { ChevronRight, Coffee, BookOpen, Package, Droplet } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";

export default function StockHubPageClient() {
  const { t } = useLanguageStore();

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.admin.navStock}</h1>
        <p className="mt-1 text-sm text-gray-600">{t.admin.stockHubIntro}</p>
      </div>

      <ul className="grid max-w-lg gap-4 sm:max-w-xl">
        <li>
          <Link
            href="/admin/mug-catalog"
            className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-amber-200/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800 ring-1 ring-amber-100">
              <Coffee className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-gray-900 group-hover:text-gray-950">
                  {t.admin.mugCatalogTitle}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-700"
                  aria-hidden
                />
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/notebook-catalog"
            className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-200/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
              <BookOpen className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-gray-900 group-hover:text-gray-950">
                  {t.admin.notebookCatalogTitle}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-700"
                  aria-hidden
                />
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/stock/ink"
            className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-violet-200/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-800 ring-1 ring-violet-100">
              <Droplet className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-gray-900 group-hover:text-gray-950">
                  {t.admin.navInkStock}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-700"
                  aria-hidden
                />
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/large-format-materials"
            className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-sky-200/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-800 ring-1 ring-sky-100">
              <Package className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-gray-900 group-hover:text-gray-950">
                  {t.admin.navLfMaterials}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-700"
                  aria-hidden
                />
              </span>
            </span>
          </Link>
        </li>
      </ul>
    </main>
  );
}
