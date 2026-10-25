"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

const PAYMENTS_PATH = "/admin/bookkeeping/purchases/payments";

/** Sub-tabs inside Bookkeeping → Purchases: incoming invoices and supplier payments. */
export default function PurchasesSubNav() {
  const pathname = usePathname();
  const { t } = useLanguageStore();
  const onPayments = pathname === PAYMENTS_PATH || pathname.startsWith(`${PAYMENTS_PATH}/`);

  const tabs = [
    { href: "/admin/bookkeeping/purchases", label: t.purchases.subTabInvoices, active: !onPayments },
    { href: PAYMENTS_PATH, label: t.purchases.subTabPayments, active: onPayments },
  ];

  return (
    <nav className="mb-5 flex flex-wrap gap-2 border-b border-gray-200" aria-label={t.admin.bookkeepingTabPurchases}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.active
              ? "border-gold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-900",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
