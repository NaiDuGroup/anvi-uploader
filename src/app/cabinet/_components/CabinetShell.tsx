"use client";

import { useMemo, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  FileText,
  LogOut,
  Plus,
  UserCircle2,
  type LucideIcon,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { NavigationProgress } from "@/components/NavigationProgress";

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
 * Compute up to two-letter initials from a display name. Used inside the
 * top-right profile pill so the name visually reads like a user button
 * instead of free-floating text wedged between the language switcher and
 * the sign-out button.
 */
function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

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
export default function CabinetShell({
  user,
  children,
}: {
  user: CabinetShellUser;
  children: ReactNode;
}) {
  const { t } = useLanguageStore();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const displayName = user.displayName || user.name;

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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-dark">
              <ClipboardList className="h-5 w-5" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-base sm:text-lg">
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

      {user.isDealer ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-xs text-emerald-900 sm:text-sm">
          {t.cabinet.dealerPricingBanner}
        </div>
      ) : null}

      <main className={cn(
        "mx-auto w-full max-w-screen-2xl flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8 transition-opacity duration-150",
        isPending && "opacity-60 pointer-events-none",
      )}>
        {children}
      </main>

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
                  <Icon className={cn("h-5 w-5", active && "text-amber-700")} />
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
