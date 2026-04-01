"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Layers,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { ReactNode } from "react";

const SIDEBAR_KEY = "admin-sidebar-collapsed";

interface AdminUser {
  id: string;
  name: string;
  role: string;
}

interface AdminShellProps {
  user: AdminUser;
  children: ReactNode;
}

export default function AdminShell({ user, children }: AdminShellProps) {
  const { t } = useLanguageStore();
  const router = useRouter();
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(SIDEBAR_KEY) === "true";
    }
    return false;
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  };

  const isWorkshop = user.role === "workshop";
  const roleName = isWorkshop ? t.admin.roleWorkshop : t.admin.roleAdmin;

  const navItems = [
    {
      label: t.admin.navOrders,
      href: "/admin",
      icon: ClipboardList,
      active: pathname === "/admin",
      visible: true,
    },
    {
      label: t.admin.catalog,
      href: "/admin/catalog",
      icon: Layers,
      active: pathname.startsWith("/admin/catalog"),
      visible: !isWorkshop,
    },
  ].filter((item) => item.visible);

  const sidebarWidth = collapsed ? "w-[64px]" : "w-[220px]";
  const mainMargin = collapsed ? "ml-[64px]" : "ml-[220px]";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex">
      <aside
        className={`${sidebarWidth} bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-20 transition-[width] duration-200`}
      >
        {/* Logo */}
        <div className="px-3 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 justify-center">
            <img
              src="/logo.png"
              alt="ANVI"
              className="w-9 h-9 rounded-full flex-shrink-0"
            />
            {!collapsed && (
              <span className="text-lg font-bold text-gray-900 truncate">
                ANVI
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${
                item.active
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-gray-100 px-2 py-3 space-y-2">
          {!collapsed && <LanguageSwitcher />}

          {!collapsed ? (
            <div className="px-1">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.name}
              </p>
              <Badge
                variant={isWorkshop ? "warning" : "secondary"}
                className="text-[10px] px-1.5 py-0 mt-0.5"
              >
                {roleName}
              </Badge>
            </div>
          ) : (
            <div className="flex justify-center" title={`${user.name} (${roleName})`}>
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            title={collapsed ? t.login.logout : undefined}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && t.login.logout}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={toggle}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors ${
              collapsed ? "justify-center" : ""
            }`}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <ChevronsRight className="w-4 h-4 flex-shrink-0" />
            ) : (
              <>
                <ChevronsLeft className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <main
        className={`flex-1 ${mainMargin} min-h-screen transition-[margin-left] duration-200`}
      >
        {children}
      </main>
    </div>
  );

  function handleLogout() {
    fetch("/api/auth/logout", { method: "POST" }).then(() => {
      router.push("/admin/login");
    });
  }
}
