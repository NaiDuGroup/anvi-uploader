"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Info, Loader2, Settings2, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { stockErrorMessage, stockSwrFetcher } from "@/app/admin/_components/stock/unified/stockApi";
import { localizedStockName, type StockCategoryJson } from "@/lib/stock/unified/adminTypes";
import { categoryPrintsDtf } from "@/lib/stock/unified/printMethods";

/** DTF blanks live in unified stock categories flagged «Печать DTF»; this tab links to them. */
export default function GarmentCategoriesTab() {
  const { t, locale } = useLanguageStore();
  const s = t.dtf.stock;
  const { data, error, isLoading } = useSWR<{ categories: StockCategoryJson[] }>(
    "/api/admin/stock/categories",
    stockSwrFetcher,
  );
  const categories: StockCategoryJson[] = (data?.categories ?? []).filter(categoryPrintsDtf);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{s.garmentsNote}</p>
            <p className="mt-0.5 text-xs text-gray-600">{s.garmentsNoteHint}</p>
          </div>
        </div>
        <Link
          href="/admin/stock/categories"
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-gray-200 bg-white px-3 text-xs font-medium shadow-sm hover:bg-gray-100"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          {s.garmentsManageCategories}
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{stockErrorMessage(error, t.stock)}</p> : null}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {s.loading}
        </p>
      ) : !error && categories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          {s.garmentsNoCategories}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/stock/c/${encodeURIComponent(c.code)}`}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-fuchsia-300 hover:bg-fuchsia-50/30",
                  !c.isActive && "opacity-60",
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-700">
                  <Shirt className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{localizedStockName(c, locale)}</span>
                  <span className="block text-xs text-gray-500">
                    {t.stock.hubItemCount(c.itemCount)}
                    {!c.isActive ? ` · ${t.stock.badgeInactive}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
