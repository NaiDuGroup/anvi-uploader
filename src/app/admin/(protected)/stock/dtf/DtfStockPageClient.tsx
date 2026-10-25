"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import PricingTab from "./PricingTab";

/**
 * DTF price list and usage norms. Garments live in the stock categories marked
 * «Печать DTF»; film, powder and ink are kept on the DTF printer («Принтеры»).
 */
export default function DtfStockPageClient() {
  const { t } = useLanguageStore();

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {t.admin.navStock}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.admin.stockSections.dtf.title}</h1>
      <p className="mb-5 mt-1 text-sm text-gray-600">{t.dtf.stock.subtitle}</p>
      <PricingTab />
    </main>
  );
}
