"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LogOut, Trash2, Users, UserCog, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { isAdmin, isSuperAdmin } from "@/lib/roles";

export type AdminShellUser = {
  name: string;
  displayName?: string | null;
  role: string;
};

type NavItem = {
  href: string;
  labelKey: "navOrders" | "navClients" | "navTrash" | "navUsers";
  Icon: LucideIcon;
  /** If set, only these roles see the item. Omit = all authenticated roles. */
  roles?: readonly string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/orders", labelKey: "navOrders", Icon: ClipboardList },
  { href: "/admin/clients", labelKey: "navClients", Icon: Users, roles: ["admin", "superadmin"] },
  { href: "/admin/trash", labelKey: "navTrash", Icon: Trash2, roles: ["admin", "superadmin"] },
  { href: "/admin/users", labelKey: "navUsers", Icon: UserCog, roles: ["superadmin"] },
];

export default function AdminAppShell({
  user,
  children,
}: {
  user: AdminShellUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useLanguageStore();
  const isWorkshop = user.role === "workshop";
  const roleName = isWorkshop
    ? t.admin.roleWorkshop
    : isSuperAdmin(user.role)
      ? t.admin.roleSuperAdmin
      : t.admin.roleAdmin;

  const navLabels: Record<NavItem["labelKey"], string> = {
    navOrders: t.admin.navOrders,
    navClients: t.admin.navClients,
    navTrash: t.admin.navTrash,
    navUsers: t.admin.navUsers,
  };

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role),
  );

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 w-full border-b border-gray-200/90 bg-white/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
        {/* Row 1: full-bleed bar; content capped to align with main */}
        <div className="mx-auto flex w-full max-w-[1600px] min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2.5 sm:min-h-[3.5rem] sm:px-5 sm:py-3">
          <Link
            href="/admin/orders"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-xl outline-none ring-offset-2 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-500/50"
          >
            <img
              src="/logo.png"
              alt=""
              className="h-9 w-9 shrink-0 rounded-full ring-1 ring-gray-200/80"
              width={36}
              height={36}
            />
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
              className="text-[10px] px-1.5 py-0"
            >
              {roleName}
            </Badge>
            <LanguageSwitcher />
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
        <div className="w-full border-t border-gray-100 bg-gradient-to-b from-gray-50/90 to-gray-50/30">
          <div className="mx-auto max-w-[1600px] px-4 pb-2.5 pt-2 sm:px-5 sm:pb-3 sm:pt-2.5">
            <nav
              className="-mx-1 flex flex-nowrap items-stretch gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
              aria-label={t.admin.navPrimaryAriaLabel}
            >
              {visibleNav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group inline-flex shrink-0 min-h-10 min-w-[2.5rem] items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 sm:min-h-11 sm:shrink sm:px-4 sm:py-2.5",
                      active
                        ? "bg-white text-gray-900 shadow-sm ring-1 ring-amber-200/90"
                        : "text-gray-600 hover:bg-white/70 hover:text-gray-900 hover:ring-1 hover:ring-gray-200/60",
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
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
