"use client";

import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calculator,
  ClipboardList,
  FileText,
  Landmark,
  LayoutGrid,
  LogOut,
  Palette,
  Package,
  Settings as SettingsIcon,
  Store,
  Trash2,
  Users,
  UserCog,
  type LucideIcon,
  BookMarked,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { canManageMugCatalog, isSuperAdmin } from "@/lib/roles";
import { NavigationProgress } from "@/components/NavigationProgress";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { getInitials } from "@/lib/initials";
import AdminFooter, { hasFixedBottomBar, isFullScreenPage } from "./AdminFooter";
import { AdminMobileNav, type AdminMobileNavEntry } from "./AdminMobileNav";
import { CORPORATE_COUNT_CHANGED_EVENT } from "../(protected)/shop/corporate-requests/corporateUi";

export type AdminShellUser = {
  name: string;
  displayName?: string | null;
  role: string;
};

type NavLabelKey =
  | "navOrders"
  | "navWorkshopBoard"
  | "navWorkshopBatches"
  | "navInvoices"
  | "navBookkeeping"
  | "navClients"
  | "navLibrary"
  | "navTrash"
  | "navDesignStudio"
  | "navUsers"
  | "navAccounting"
  | "navShop"
  | "navSettings";

type NavItem = {
  href: string;
  labelKey: NavLabelKey;
  Icon: LucideIcon;
  /** If set, only these roles see the item. Omit = all authenticated roles. */
  roles?: readonly string[];
};

/** Flip on when Design Studio is ready for everyone. Routes stay reachable by URL. */
const SHOW_DESIGN_STUDIO_NAV = false;

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/orders", labelKey: "navOrders", Icon: ClipboardList },
  { href: "/admin/design-studio", labelKey: "navDesignStudio", Icon: Palette },
  { href: "/admin/workshop-board", labelKey: "navWorkshopBoard", Icon: LayoutGrid, roles: ["workshop", "superadmin"] },
  { href: "/admin/invoices", labelKey: "navInvoices", Icon: FileText, roles: ["admin", "superadmin", "workshop"] },
  { href: "/admin/bookkeeping", labelKey: "navBookkeeping", Icon: Landmark, roles: ["superadmin"] },
  { href: "/admin/clients", labelKey: "navClients", Icon: Users, roles: ["admin", "superadmin", "workshop"] },
  { href: "/admin/library", labelKey: "navLibrary", Icon: BookMarked, roles: ["admin", "superadmin", "workshop"] },
  { href: "/admin/trash", labelKey: "navTrash", Icon: Trash2, roles: ["admin", "superadmin", "workshop"] },
  { href: "/admin/users", labelKey: "navUsers", Icon: UserCog, roles: ["superadmin"] },
  { href: "/admin/accounting", labelKey: "navAccounting", Icon: Calculator, roles: ["superadmin"] },
  // «Сайт» also holds «Заявки компаний» (/admin/shop/corporate-requests).
  { href: "/admin/shop", labelKey: "navShop", Icon: Store, roles: ["superadmin"] },
  { href: "/admin/settings", labelKey: "navSettings", Icon: SettingsIcon, roles: ["superadmin"] },
];

export default function AdminAppShell({
  user,
  companyLogoSrc,
  studioPhone = "",
  children,
}: {
  user: AdminShellUser;
  companyLogoSrc: string | null;
  /** Main studio phone for the footer (company profile studio card). */
  studioPhone?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguageStore();
  const [isPending, startTransition] = useTransition();
  const headerRef = useRef<HTMLElement>(null);
  const isWorkshop = user.role === "workshop";
  const roleName = isWorkshop
    ? t.admin.roleWorkshop
    : isSuperAdmin(user.role)
      ? t.admin.roleSuperAdmin
      : t.admin.roleAdmin;

  // Expose sticky header height so page subheaders (e.g. bookkeeping) can pin below it.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () => {
      document.documentElement.style.setProperty(
        "--admin-header-h",
        `${el.offsetHeight}px`,
      );
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--admin-header-h");
    };
  }, []);

  const navLabels: Record<NavItem["labelKey"], string> = {
    navOrders: t.admin.navOrders,
    navWorkshopBoard: t.workshopBoard.navLink,
    navWorkshopBatches: t.admin.navWorkshopBatches,
    navInvoices: t.admin.navInvoices,
    navBookkeeping: t.admin.navBookkeeping,
    navClients: t.admin.navClients,
    navLibrary: t.admin.navLibrary,
    navTrash: t.admin.navTrash,
    navDesignStudio: t.admin.navDesignStudio,
    navUsers: t.admin.navUsers,
    navAccounting: t.admin.navAccounting,
    navShop: t.shopReport.navShop,
    navSettings: t.admin.navSettings,
  };

  const showStockNav = canManageMugCatalog(user.role);
  const stockNavActive =
    pathname === "/admin/stock" ||
    pathname.startsWith("/admin/stock/") ||
    pathname === "/admin/mug-catalog" ||
    pathname.startsWith("/admin/mug-catalog/") ||
    pathname === "/admin/notebook-catalog" ||
    pathname.startsWith("/admin/notebook-catalog/") ||
    pathname === "/admin/large-format-materials" ||
    pathname.startsWith("/admin/large-format-materials/") ||
    pathname === "/admin/sheet-papers" ||
    pathname.startsWith("/admin/sheet-papers/");

  // «Заявки компаний» badge (on the «Сайт» tab): new storefront requests, refreshed on navigation, after a status
  // change (window event from the requests pages), on window focus and every minute while visible.
  const canSeeCorporate = isSuperAdmin(user.role);
  const [corporateNew, setCorporateNew] = useState(0);
  useEffect(() => {
    if (!canSeeCorporate) return;
    let alive = true;
    const load = () =>
      fetch("/api/admin/corporate-requests/count", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ new?: number }>) : null))
        .then((d) => {
          if (alive && d) setCorporateNew(Number(d.new) || 0);
        })
        .catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    window.addEventListener(CORPORATE_COUNT_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(CORPORATE_COUNT_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canSeeCorporate, pathname]);
  const navBadge = (href: string) => (href === "/admin/shop" ? corporateNew : 0);

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.labelKey === "navDesignStudio" && !SHOW_DESIGN_STUDIO_NAV) return false;
    return !item.roles || item.roles.includes(user.role);
  });

  const isNavItemActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    // Макеты цеха open from the board, so keep the board tab lit.
    (href === "/admin/workshop-board" && pathname.startsWith("/admin/workshop-batches"));

  // ── Phone navigation (bottom tab bar + «Меню» sheet), below `sm` only ──
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const displayName = user.displayName ?? user.name;
  const initials = getInitials(displayName);
  // Orders already in the store (orders page polls them); no extra request here.
  const ordersUnread = useOrdersStore((s) =>
    s.orders.reduce((sum, o) => sum + o.unreadCommentCount + o.unreadClientMessageCount, 0),
  );
  // «Нужен макет»: orders waiting for a new layout (from the orders page's last fetch).
  const ordersLayoutIssues = useOrdersStore((s) => s.layoutIssueOrders.length);
  const mobileMenuItems: AdminMobileNavEntry[] = [
    ...visibleNav.map((item) => ({
      href: item.href,
      label: navLabels[item.labelKey],
      Icon: item.Icon,
      active: isNavItemActive(item.href),
      badge: navBadge(item.href),
    })),
    ...(showStockNav
      ? [{ href: "/admin/stock", label: t.admin.navStock, Icon: Package, active: stockNavActive }]
      : []),
  ];
  // Bar: Заказы · Цех · «+» · Счета · Меню. A slot the role can't open takes
  // the next allowed menu item instead.
  const usedTabs = new Set<string>();
  const pickTab = (preferredHref: string) => {
    const entry =
      mobileMenuItems.find((m) => m.href === preferredHref && !usedTabs.has(m.href)) ??
      mobileMenuItems.find((m) => !usedTabs.has(m.href));
    if (entry) usedTabs.add(entry.href);
    return entry;
  };
  const mobileTabs = [
    pickTab("/admin/orders"),
    pickTab("/admin/workshop-board"),
    pickTab("/admin/invoices"),
  ]
    .filter((e): e is AdminMobileNavEntry => Boolean(e))
    .map((e) =>
      e.href === "/admin/workshop-board" ? { ...e, label: t.admin.mobileNavWorkshop } : e,
    );

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <NavigationProgress isNavigating={isPending} />
      <header
        ref={headerRef}
        className="sticky top-0 z-20 w-full border-b border-gray-200/90 bg-white/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/80"
      >
        {/* Row 1: full-bleed bar; content capped to align with main */}
        <div className="mx-auto flex w-full max-w-[1600px] min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2.5 sm:min-h-[3.5rem] sm:px-5 sm:py-3">
          <Link
            href="/admin/orders"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-xl outline-none ring-offset-2 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-500/50"
          >
            {companyLogoSrc ? (
              <img
                src={companyLogoSrc}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full ring-1 ring-gray-200/80 object-cover"
                width={36}
                height={36}
              />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-900 ring-1 ring-gray-200/80"
                aria-hidden
              >
                A
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold tracking-tight text-gray-900">ANVI</p>
              <p className="text-[11px] font-medium text-gray-500">{t.admin.appShellSubtitle}</p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2.5">
            <p className="hidden max-w-[10rem] truncate text-xs text-gray-500 md:block lg:max-w-xs">
              <span className="text-gray-400">{t.admin.loggedInAs}</span>{" "}
              <span className="font-medium text-gray-700">{user.displayName ?? user.name}</span>
            </p>
            <Badge
              variant={isWorkshop ? "warning" : "secondary"}
              className="hidden text-[10px] px-1.5 py-0 sm:inline-flex"
            >
              {roleName}
            </Badge>
            <LanguageSwitcher />
            {/* Phones: initials avatar opens the full menu sheet. */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-[11px] font-bold uppercase text-gold-dark transition-colors hover:bg-gray-50 sm:hidden"
              aria-label={t.admin.mobileNavMenu}
              title={displayName}
            >
              {initials}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-9 shrink-0 border-red-200/90 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              title={t.login.logout}
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t.login.logout}</span>
            </Button>
          </div>
        </div>

        {/* Row 2: nav strip edge-to-edge; inner nav aligned with main */}
        <div className="hidden w-full border-t border-gray-100 bg-gradient-to-b from-gray-50/90 to-gray-50/30 sm:block">
          <div className="mx-auto max-w-[1600px] px-4 pb-2.5 pt-2 sm:px-5 sm:pb-3 sm:pt-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <nav
                className="-mx-1 flex min-w-0 flex-1 flex-nowrap items-stretch gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
                aria-label={t.admin.navPrimaryAriaLabel}
              >
                {visibleNav.map((item) => {
                  const active = isNavItemActive(item.href);
                  const Icon = item.Icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={(e) => {
                        if (!active) {
                          e.preventDefault();
                          navigate(item.href);
                        }
                      }}
                      className={cn(
                        "group inline-flex shrink-0 min-h-10 min-w-[2.5rem] items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 sm:min-h-11 sm:shrink sm:px-4 sm:py-2.5",
                        active
                          ? "bg-white text-gray-900 shadow-sm ring-1 ring-amber-200/90"
                          : "text-gray-600 hover:bg-white/70 hover:text-gray-900 hover:ring-1 hover:ring-gray-200/60",
                        isPending && !active && "pointer-events-none opacity-60",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors sm:h-[1.125rem] sm:w-[1.125rem]",
                          active ? "text-amber-700" : "text-gray-400 group-hover:text-gray-600",
                        )}
                        aria-hidden
                      />
                      <span>{navLabels[item.labelKey]}</span>
                      {navBadge(item.href) > 0 ? (
                        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-[18px] text-white">
                          {navBadge(item.href)}
                        </span>
                      ) : null}
                      {item.href === "/admin/orders" && ordersLayoutIssues > 0 ? (
                        <span
                          data-testid="admin-nav-layout-issue-badge"
                          title={t.layoutIssue.adminNavBadgeTitle(ordersLayoutIssues)}
                          className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold leading-[18px] text-amber-900 ring-1 ring-amber-300"
                        >
                          {ordersLayoutIssues}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </nav>

              {showStockNav ? (
                <div className="flex shrink-0 justify-end border-t border-gray-100/80 pt-2 sm:border-t-0 sm:pt-0">
                  <Link
                    href="/admin/stock"
                    onClick={(e) => {
                      if (!stockNavActive) {
                        e.preventDefault();
                        navigate("/admin/stock");
                      }
                    }}
                    className={cn(
                      "group inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 sm:min-h-11 sm:w-auto sm:justify-center sm:py-2.5",
                      stockNavActive
                        ? "bg-white text-gray-900 shadow-sm ring-1 ring-amber-200/90"
                        : "text-gray-600 hover:bg-white/70 hover:text-gray-900 hover:ring-1 hover:ring-gray-200/60",
                      isPending && !stockNavActive && "pointer-events-none opacity-60",
                    )}
                    aria-current={stockNavActive ? "page" : undefined}
                  >
                    <Package
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors sm:h-[1.125rem] sm:w-[1.125rem]",
                        stockNavActive ? "text-amber-700" : "text-gray-400 group-hover:text-gray-600",
                      )}
                      aria-hidden
                    />
                    <span>{t.admin.navStock}</span>
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <div className={cn("min-w-0 flex-1 transition-opacity duration-150", isPending && "opacity-60 pointer-events-none")}>
        {children}
      </div>
      <AdminFooter user={user} roleName={roleName} studioPhone={studioPhone} />
      <AdminMobileNav
        tabs={mobileTabs}
        menuItems={mobileMenuItems}
        // Workshop has studio-admin parity and sees «Новый заказ» on the orders page too.
        newOrder={{
          href: "/admin/orders/new",
          label: t.admin.newOrder,
          active: pathname === "/admin/orders/new",
        }}
        showBar={!isFullScreenPage(pathname) && !hasFixedBottomBar(pathname)}
        ordersUnread={ordersUnread}
        ordersLayoutIssues={ordersLayoutIssues}
        menuOpen={mobileMenuOpen}
        onMenuOpenChange={setMobileMenuOpen}
        onNavigate={navigate}
        onLogout={handleLogout}
        isPending={isPending}
        userName={displayName}
        initials={initials}
        roleName={roleName}
        roleIsWorkshop={isWorkshop}
      />
    </div>
  );
}
