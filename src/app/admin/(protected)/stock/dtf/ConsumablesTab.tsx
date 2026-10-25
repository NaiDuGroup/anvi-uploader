"use client";

import Link from "next/link";
import { ArrowRight, Printer } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** DTF film, powder and ink moved to the unified «Принтеры» page (DTF printer card). */
export default function ConsumablesTab() {
  const { t } = useLanguageStore();
  const p = t.stock.printers;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-800 ring-1 ring-fuchsia-100">
            <Printer className="h-5 w-5" aria-hidden />
          </span>
          <p className="min-w-0 text-sm text-gray-700">{p.dtfNote}</p>
        </div>
        <Link
          href="/admin/stock/printers#dtf"
          className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-medium text-fuchsia-700 hover:underline sm:self-auto"
        >
          {p.dtfLink}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
