"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import ConsumablesTab from "./ConsumablesTab";
import GarmentCategoriesTab from "./GarmentCategoriesTab";
import PricingTab from "./PricingTab";

enum DtfStockTab {
  Garments = "garments",
  Consumables = "consumables",
  Pricing = "pricing",
}

export default function DtfStockPageClient() {
  const { t } = useLanguageStore();
  const s = t.dtf.stock;
  const [tab, setTab] = useState<DtfStockTab>(DtfStockTab.Garments);

  const tabs: { id: DtfStockTab; label: string }[] = [
    { id: DtfStockTab.Garments, label: s.tabGarments },
    { id: DtfStockTab.Consumables, label: s.tabConsumables },
    { id: DtfStockTab.Pricing, label: s.tabPricing },
  ];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" />
        {t.admin.navStock}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.admin.stockSections.dtf.title}</h1>
      <p className="mt-1 text-sm text-gray-600">{s.subtitle}</p>

      <div role="tablist" className="mb-5 mt-5 flex gap-1 border-b border-gray-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === item.id
                ? "border-fuchsia-600 text-fuchsia-800"
                : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === DtfStockTab.Garments && <GarmentCategoriesTab />}
      {tab === DtfStockTab.Consumables && <ConsumablesTab />}
      {tab === DtfStockTab.Pricing && <PricingTab />}
    </main>
  );
}
