"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, GitCommitHorizontal, Phone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useAdminFooterStatus } from "@/lib/swr";
import { canManageMugCatalog, isAdmin, isSuperAdmin } from "@/lib/roles";
import { FOOTER_STATUS_GROUPS, type FooterStatusGroup } from "@/lib/studioInfo/footerStatus";
import { formatPhone, telHref } from "@/lib/studioInfo/studioInfo";
import type { OrderStatus } from "@/lib/validations";

const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

/** Full-viewport tools where a footer would push the canvas off screen. */
export function isFullScreenPage(pathname: string): boolean {
  return /^\/admin\/design-studio\/(?!assets(?:\/|$))[^/]+/.test(pathname);
}

/** Pages with their own fixed bottom save bar — keep the footer above it. */
export function hasFixedBottomBar(pathname: string): boolean {
  return (
    pathname === "/admin/settings" ||
    pathname.startsWith("/admin/stock/prices") ||
    pathname.startsWith("/admin/stock/stocktake")
  );
}

function formatBuildTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const COUNTER_TONE: Record<FooterStatusGroup, string> = {
  new: "text-sky-700",
  inWork: "text-amber-700",
  ready: "text-emerald-700",
  issue: "text-red-700",
};

/**
 * Slim staff status bar under every admin page: shift counters (click =
 * orders list filtered to those statuses), low stock, quick links for the
 * role, who is signed in, the studio phone and the build.
 */
export default function AdminFooter({
  user,
  roleName,
  studioPhone,
}: {
  user: { name: string; displayName?: string | null; role: string };
  roleName: string;
  studioPhone: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale } = useLanguageStore();
  const f = t.footer;
  const setStatusFilter = useOrdersStore((s) => s.setStatusFilter);
  const hidden = isFullScreenPage(pathname);
  const counts = useAdminFooterStatus(!hidden && isAdmin(user.role));
  if (hidden) return null;

  const counters: { key: FooterStatusGroup; label: string }[] = [
    { key: "new", label: f.adminNew },
    { key: "inWork", label: f.adminInWork },
    { key: "ready", label: f.adminReady },
    { key: "issue", label: f.adminIssue },
  ];

  const openOrders = (key: FooterStatusGroup) => {
    setStatusFilter([...FOOTER_STATUS_GROUPS[key]] as OrderStatus[]);
    router.push("/admin/orders");
  };

  const stockRole = canManageMugCatalog(user.role);
  const links = [
    stockRole && { href: "/admin/stock/prices", label: f.linkPrices },
    stockRole && { href: "/admin/stock/stocktake", label: f.linkStocktake },
    isAdmin(user.role) && { href: "/admin/trash", label: f.linkTrash },
    isSuperAdmin(user.role) && { href: "/admin/settings", label: f.linkSettings },
  ].filter((l): l is { href: string; label: string } => Boolean(l));

  const buildTime = BUILD_TIME ? formatBuildTime(BUILD_TIME, locale) : "";
  const buildLabel = BUILD_SHA ? `${BUILD_SHA}${buildTime ? ` · ${buildTime}` : ""}` : f.adminDev;

  return (
    <footer
      className={cn(
        "mt-8 border-t border-gray-200 bg-white text-xs text-gray-600",
        // Page save bar, or (phones) the shell's bottom tab bar.
        hasFixedBottomBar(pathname) ? "pb-20" : "pb-24 sm:pb-0",
      )}
      aria-label={f.adminStatusAria}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-5">
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label={f.adminStatusAria}>
          {counters.map(({ key, label }) => {
            const n = counts?.[key];
            if (key === "issue" && !n) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => openOrders(key)}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-100 hover:text-gray-900"
              >
                <span>{label}</span>
                <span className={cn("font-semibold tabular-nums", COUNTER_TONE[key])}>{n ?? "–"}</span>
              </button>
            );
          })}
          {counts?.lowStock ? (
            <Link
              href="/admin/stock"
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-amber-800 hover:bg-amber-50"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {f.adminLowStock(counts.lowStock)}
            </Link>
          ) : null}
        </nav>

        {links.length > 0 ? (
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-gray-900 hover:underline underline-offset-2">
                {l.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500">
          {studioPhone ? (
            <a href={telHref(studioPhone)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-gray-900">
              <Phone className="h-3 w-3" aria-hidden />
              {formatPhone(studioPhone)}
            </a>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3 w-3" aria-hidden />
            <span className="font-medium text-gray-700">{user.displayName ?? user.name}</span>
            <span>· {roleName}</span>
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-gray-400" title={f.adminBuild}>
            <GitCommitHorizontal className="h-3 w-3" aria-hidden />
            {buildLabel}
          </span>
        </div>
      </div>
    </footer>
  );
}
