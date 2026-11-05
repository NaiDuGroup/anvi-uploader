"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, Menu, Plus, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

export type AdminMobileNavEntry = {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  /** Small counter on the menu item (e.g. new company requests). */
  badge?: number;
};

/**
 * Phone-only (below `sm`) staff navigation, mirroring the cabinet:
 * a fixed bottom tab bar (two tabs · raised gold «+» · one tab · «Меню»)
 * and a bottom sheet listing every nav item the role may open.
 * Desktop never renders any of it (`sm:hidden`).
 */
export function AdminMobileNav({
  tabs,
  menuItems,
  newOrder,
  showBar,
  ordersUnread,
  ordersLayoutIssues = 0,
  menuOpen,
  onMenuOpenChange,
  onNavigate,
  onLogout,
  isPending,
  userName,
  initials,
  roleName,
  roleIsWorkshop,
}: {
  /** Tabs left/right of the «+» button: [left…, right…] split in half. */
  tabs: AdminMobileNavEntry[];
  /** Everything the role may open (sheet). */
  menuItems: AdminMobileNavEntry[];
  /** Raised gold «+» (omit for roles without «Новый заказ»). */
  newOrder: { href: string; label: string; active: boolean } | null;
  /** False on full-screen tools and pages with their own fixed bottom save bar. */
  showBar: boolean;
  /** Unread comments badge on the orders tab. */
  ordersUnread: number;
  /** Orders waiting for a new layout («Нужен макет»): red badge on the orders tab. */
  ordersLayoutIssues?: number;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
  onLogout: () => void;
  isPending: boolean;
  userName: string;
  initials: string;
  roleName: string;
  roleIsWorkshop: boolean;
}) {
  const { t } = useLanguageStore();
  const menuActive = menuItems.some((m) => m.active) && !tabs.some((m) => m.active) && !newOrder?.active;
  const leftTabs = tabs.slice(0, Math.ceil(tabs.length / 2));
  const rightTabs = tabs.slice(Math.ceil(tabs.length / 2));

  const go = (e: MouseEvent, href: string, active: boolean) => {
    onMenuOpenChange(false);
    if (!active) {
      e.preventDefault();
      onNavigate(href);
    }
  };

  const renderTab = (item: AdminMobileNavEntry) => {
    const Icon = item.Icon;
    return (
      <li key={item.href} className="flex flex-1 justify-center">
        <Link
          href={item.href}
          onClick={(e) => go(e, item.href, item.active)}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            item.active ? "text-amber-700" : "text-gray-500 hover:text-gray-800",
            isPending && !item.active && "pointer-events-none opacity-60",
          )}
        >
          <span className="relative">
            <Icon className="h-5 w-5" aria-hidden />
            {item.href === "/admin/orders" && ordersLayoutIssues > 0 ? (
              <span
                data-testid="admin-mobile-nav-layout-issue-badge"
                title={t.layoutIssue.adminNavBadgeTitle(ordersLayoutIssues)}
                className="absolute -left-2 -top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-[15px] text-white"
              >
                {ordersLayoutIssues}
              </span>
            ) : null}
            {item.href === "/admin/orders" && ordersUnread > 0 ? (
              <span className="absolute -right-2 -top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold leading-[15px] text-white">
                {ordersUnread}
              </span>
            ) : null}
          </span>
          <span className="max-w-[4.75rem] truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <Dialog.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
      {showBar ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
          aria-label={t.admin.mobileNavAria}
        >
          <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around px-2 py-1.5">
            {leftTabs.map(renderTab)}
            {newOrder ? (
              <li className="-mt-5 flex flex-1 justify-center">
                <Link
                  href={newOrder.href}
                  onClick={(e) => go(e, newOrder.href, newOrder.active)}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-colors",
                    "bg-gold ring-4 ring-white hover:bg-gold-dark",
                    newOrder.active && "bg-gold-dark",
                  )}
                  aria-label={newOrder.label}
                  title={newOrder.label}
                >
                  <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
                </Link>
              </li>
            ) : null}
            {rightTabs.map(renderTab)}
            <li className="flex flex-1 justify-center">
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    menuActive || menuOpen ? "text-amber-700" : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  <Menu className="h-5 w-5" aria-hidden />
                  <span>{t.admin.mobileNavMenu}</span>
                </button>
              </Dialog.Trigger>
            </li>
          </ul>
        </nav>
      ) : null}

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 sm:hidden" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:hidden"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-bold uppercase text-gold-dark"
              aria-hidden
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <Dialog.Title className="truncate text-sm font-semibold text-gray-900">
                {userName}
              </Dialog.Title>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                <span className="truncate">{t.admin.loggedInAs}</span>
                <Badge
                  variant={roleIsWorkshop ? "warning" : "secondary"}
                  className="shrink-0 px-1.5 py-0 text-[10px]"
                >
                  {roleName}
                </Badge>
              </div>
            </div>
            <Dialog.Close
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              aria-label={t.cabinet.orderFileClose}
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label={t.admin.navPrimaryAriaLabel}>
            <ul className="space-y-0.5">
              {menuItems.map((item) => {
                const Icon = item.Icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={(e) => go(e, item.href, item.active)}
                      aria-current={item.active ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                        item.active
                          ? "bg-amber-50 text-gray-900 ring-1 ring-amber-200/90"
                          : "text-gray-700 hover:bg-gray-50",
                      )}
                    >
                      <Icon
                        className={cn("h-5 w-5 shrink-0", item.active ? "text-amber-700" : "text-gray-400")}
                        aria-hidden
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? (
                        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-[18px] text-white">
                          {item.badge}
                        </span>
                      ) : null}
                      {item.href === "/admin/orders" && ordersLayoutIssues > 0 ? (
                        <span
                          title={t.layoutIssue.adminNavBadgeTitle(ordersLayoutIssues)}
                          className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-[18px] text-white"
                        >
                          {ordersLayoutIssues}
                        </span>
                      ) : null}
                      {item.href === "/admin/orders" && ordersUnread > 0 ? (
                        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold leading-[18px] text-white">
                          {ordersUnread}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-gray-100 px-2 py-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden />
              {t.login.logout}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
