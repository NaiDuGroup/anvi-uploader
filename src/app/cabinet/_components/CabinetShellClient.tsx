"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardList,
  FileText,
  LogOut,
  MessageCircle,
  Plus,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { TranslationDictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NavigationProgress } from "@/components/NavigationProgress";
import { useCabinetUnread, type CabinetLayoutIssueOrder } from "@/lib/swr";
import { CABINET_NEEDS_LAYOUT_FILTER } from "@/lib/cabinetOrdersList";
import { getInitials } from "@/lib/initials";
import { playNotificationSound } from "@/lib/notificationSound";
import CabinetFooter, { type CabinetFooterData } from "./CabinetFooter";

export type CabinetShellUser = {
  name: string;
  displayName?: string | null;
  isDealer: boolean;
};

type NavItem = {
  href: string;
  labelKey: "navOrders" | "navProfile" | "navNewOrder" | "navInvoices";
  Icon: LucideIcon;
  /** Renders as a circular accent button in the bottom-mobile nav. */
  primary?: boolean;
};

/** Where the «Нужен макет» banner / badge lead: the one order, or the filtered list. */
function layoutIssueHref(orders: readonly CabinetLayoutIssueOrder[]): string {
  return orders.length === 1
    ? `/cabinet/orders/${orders[0]!.id}`
    : `/cabinet/orders?status=${CABINET_NEEDS_LAYOUT_FILTER}`;
}

const MOBILE_NAV: NavItem[] = [
  { href: "/cabinet/orders", labelKey: "navOrders", Icon: ClipboardList },
  { href: "/cabinet/invoices", labelKey: "navInvoices", Icon: FileText },
  {
    href: "/cabinet/orders/new",
    labelKey: "navNewOrder",
    Icon: Plus,
    primary: true,
  },
  { href: "/cabinet/profile", labelKey: "navProfile", Icon: UserCircle2 },
];

/**
 * Customer-portal app shell.
 *
 * Layout intent:
 * - Full-bleed (`max-w-screen-2xl`) — the user explicitly asked for col-12.
 * - Sticky top header with brand left, and on the right: language switcher,
 *   profile button (avatar + name → /cabinet/profile), and sign-out.
 * - No desktop tabs row — the brand logo is the orders link, and the profile
 *   pill is the profile link, so a horizontal tab strip would be redundant.
 * - Bottom-fixed nav on mobile with a centered primary "+" action so reaching
 *   it with a thumb on a phone is comfortable.
 */
export default function CabinetShellClient({
  user,
  companyLogoSrc,
  footer,
  children,
}: {
  user: CabinetShellUser;
  /** Company logo from the company profile (same as admin header / login). */
  companyLogoSrc: string | null;
  /** Public studio card + payment details for the footer. */
  footer: CabinetFooterData;
  children: ReactNode;
}) {
  const { t } = useLanguageStore();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const displayName = user.displayName || user.name;

  // Cabinet-wide unread studio-message indicator + sound on increase.
  const { totalUnread, layoutIssueOrders } = useCabinetUnread();
  const layoutIssueCount = layoutIssueOrders.length;
  const layoutHref = layoutIssueHref(layoutIssueOrders);
  const prevUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevUnreadRef.current !== null && totalUnread > prevUnreadRef.current) {
      playNotificationSound();
      toast(t.cabinet.newMessageToast);
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread, t]);

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  const handleLogout = async () => {
    await fetch("/api/cabinet/auth/logout", { method: "POST" });
    router.push("/cabinet/login");
    router.refresh();
  };

  /** Client-side navigation that also works between `?status=` variants of the same page. */
  const navigateTo = (e: MouseEvent, href: string) => {
    e.preventDefault();
    navigate(href);
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const profileActive = isActive("/cabinet/profile");

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <NavigationProgress isNavigating={isPending} />
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link
            href="/cabinet/orders"
            onClick={(e) => {
              if (!isActive("/cabinet/orders")) {
                e.preventDefault();
                navigate("/cabinet/orders");
              }
            }}
            className="flex min-w-0 items-center gap-2.5 font-semibold text-gray-900"
          >
            {companyLogoSrc ? (
              <img
                src={companyLogoSrc}
                alt="ANVI"
                className="h-10 w-10 shrink-0 rounded-full object-cover sm:h-11 sm:w-11"
                width={44}
                height={44}
              />
            ) : (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-900 sm:h-11 sm:w-11"
                aria-hidden
              >
                A
              </span>
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              {/* On phones the right cluster leaves no room for the title —
                  the logo carries the brand there, only the role label stays. */}
              <span className="hidden truncate text-base sm:block sm:text-lg">
                {t.cabinet.headerTitle}
              </span>
              {user.isDealer ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  {t.cabinet.dealerBadge}
                </span>
              ) : null}
            </span>
          </Link>

          {/*
            Right cluster: language selector / profile button / logout.
            The profile entry is rendered as a pill that *looks* like a button
            (avatar circle + name) and acts as the navigation entry to the
            profile page. This replaces the free-floating name text that
            previously sat awkwardly between two interactive elements.
          */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />

            {layoutIssueCount > 0 ? (
              <Link
                href={layoutHref}
                onClick={(e) => navigateTo(e, layoutHref)}
                data-testid="cabinet-orders-badge-layout"
                aria-label={t.layoutIssue.cabinetMenuBadgeTitle(layoutIssueCount)}
                title={t.layoutIssue.cabinetMenuBadgeTitle(layoutIssueCount)}
                className="relative hidden h-9 items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 sm:inline-flex"
              >
                <ClipboardList className="h-4 w-4" aria-hidden />
                <span>{t.cabinet.navOrders}</span>
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">
                  {layoutIssueCount}
                </span>
              </Link>
            ) : null}

            {totalUnread > 0 ? (
              <Link
                href="/cabinet/orders"
                onClick={(e) => {
                  if (!isActive("/cabinet/orders")) {
                    e.preventDefault();
                    navigate("/cabinet/orders");
                  }
                }}
                aria-label={t.cabinet.unreadMessages}
                title={t.cabinet.unreadMessages}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-4 text-white">
                  {totalUnread}
                </span>
              </Link>
            ) : null}

            <Link
              href="/cabinet/profile"
              aria-label={t.cabinet.navProfile}
              aria-current={profileActive ? "page" : undefined}
              title={displayName}
              className={cn(
                "hidden h-9 items-center gap-2 rounded-full border px-1 pr-3 text-sm font-medium transition-colors sm:inline-flex",
                profileActive
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold uppercase",
                  profileActive
                    ? "bg-amber-200/80 text-amber-950"
                    : "bg-gold/15 text-gold-dark",
                )}
              >
                {initials}
              </span>
              <span className="max-w-[10rem] truncate">{displayName}</span>
            </Link>

            {/* On mobile the name button is hidden (bottom nav has Profile);
                we surface a small icon-only profile entry instead so the user
                can still tap their avatar from the top-right. */}
            <Link
              href="/cabinet/profile"
              aria-label={t.cabinet.navProfile}
              aria-current={profileActive ? "page" : undefined}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold uppercase transition-colors sm:hidden",
                profileActive
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-gray-200 bg-white text-gold-dark hover:bg-gray-50",
              )}
            >
              {initials}
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              aria-label={t.cabinet.logout}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.cabinet.logout}</span>
            </button>
          </div>
        </div>
      </header>

      {layoutIssueCount > 0 ? (
        <LayoutIssueBanner
          orders={layoutIssueOrders}
          href={layoutHref}
          t={t}
          onNavigate={(e) => navigateTo(e, layoutHref)}
        />
      ) : null}

      <main className={cn(
        "mx-auto w-full max-w-screen-2xl flex-1 px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6 lg:px-8 transition-opacity duration-150",
        isPending && "opacity-60 pointer-events-none",
      )}>
        {children}
      </main>

      {/* Footer carries its own mobile bottom padding for the fixed nav below. */}
      <CabinetFooter data={footer} />

      {/* Mobile bottom navigation — the primary action sits in the middle so
          customers can tap "Comandă nouă" with their thumb on a phone. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        aria-label={t.cabinet.headerTitle}
      >
        <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around px-2 py-1.5">
          {MOBILE_NAV.map((item) => {
            const Icon = item.Icon;
            const active = isActive(item.href);
            if (item.primary) {
              return (
                <li key={item.href} className="-mt-5 flex flex-1 justify-center">
                  <Link
                    href={item.href}
                    onClick={(e) => {
                      if (!active) {
                        e.preventDefault();
                        navigate(item.href);
                      }
                    }}
                    className={cn(
                      "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-colors",
                      "bg-gold ring-4 ring-white hover:bg-gold-dark",
                      active && "bg-gold-dark",
                    )}
                    aria-label={t.cabinet.navNewOrder}
                  >
                    <Icon className="h-6 w-6" strokeWidth={2.5} />
                  </Link>
                </li>
              );
            }
            return (
              <li key={item.href} className="flex flex-1 justify-center">
                <Link
                  href={item.href}
                  onClick={(e) => {
                    if (!active) {
                      e.preventDefault();
                      navigate(item.href);
                    }
                  }}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "text-amber-700"
                      : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  <span className="relative">
                    <Icon className={cn("h-5 w-5", active && "text-amber-700")} />
                    {item.labelKey === "navOrders" && totalUnread > 0 ? (
                      <span className="absolute -right-2 -top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold leading-[15px] text-white">
                        {totalUnread}
                      </span>
                    ) : null}
                    {/* «Нужен макет»: red count on the other side, so both badges stay readable. */}
                    {item.labelKey === "navOrders" && layoutIssueCount > 0 ? (
                      <span
                        data-testid="cabinet-orders-badge-layout-mobile"
                        title={t.layoutIssue.cabinetMenuBadgeTitle(layoutIssueCount)}
                        aria-label={t.layoutIssue.cabinetMenuBadgeTitle(layoutIssueCount)}
                        className="absolute -left-2 -top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-[15px] text-white ring-2 ring-white"
                      >
                        {layoutIssueCount}
                      </span>
                    ) : null}
                  </span>
                  <span>{t.cabinet[item.labelKey]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Red strip under the header on every cabinet page while some order line
 * waits for the customer's new layout («Нужен макет»): one order → straight to
 * it, several → the list filtered to them.
 */
function LayoutIssueBanner({
  orders,
  href,
  t,
  onNavigate,
}: {
  orders: readonly CabinetLayoutIssueOrder[];
  href: string;
  t: TranslationDictionary;
  onNavigate: (e: MouseEvent) => void;
}) {
  const text =
    orders.length === 1
      ? t.layoutIssue.cabinetBannerOne(orders[0]!.orderNumber)
      : t.layoutIssue.cabinetBannerMany(orders.length);
  return (
    <div className="border-b border-red-200 bg-red-50">
      <Link
        href={href}
        onClick={onNavigate}
        data-testid="cabinet-layout-banner"
        role="alert"
        className="group mx-auto flex w-full max-w-screen-2xl items-start gap-3 px-4 py-2.5 text-red-800 sm:items-center sm:px-6 lg:px-8"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-white sm:mt-0">
          <AlertTriangle className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold group-hover:underline">{text}</span>
          <span className="block text-xs text-red-700">{t.layoutIssue.cabinetBannerHint}</span>
        </span>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-red-500 transition-transform group-hover:translate-x-0.5 sm:mt-0" aria-hidden />
      </Link>
    </div>
  );
}
