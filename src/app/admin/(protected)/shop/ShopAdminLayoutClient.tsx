"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, TicketPercent } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/shop/report", key: "subTabReport" as const, Icon: BarChart3 },
  { href: "/admin/shop/promo", key: "subTabPromo" as const, Icon: TicketPercent },
  { href: "/admin/shop/corporate-requests", key: "subTabCorporate" as const, Icon: Building2 },
];

export default function ShopAdminLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useLanguageStore();
  return (
    <div>
      <div
        className="sticky z-10 border-b border-gray-200/80 bg-white/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/90"
        style={{ top: "var(--admin-header-h, 7.5rem)" }}
      >
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-gray-900 sm:text-xl">{t.shopReport.sectionTitle}</h1>
            <p className="mt-0.5 hidden text-sm text-gray-500 sm:block">{t.shopReport.sectionSubtitle}</p>
          </div>
          <nav className="inline-flex w-full overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1 sm:w-auto" aria-label={t.shopReport.navShop}>
            {TABS.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              const Icon = tab.Icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4",
                    active ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80" : "text-gray-500 hover:text-gray-800",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {tab.key === "subTabCorporate" ? t.corporate.navTitle : t.shopReport[tab.key]}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
