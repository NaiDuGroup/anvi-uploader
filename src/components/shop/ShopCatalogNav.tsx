"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ShopNav, ShopNavGroupId, ShopNavLink } from "@/lib/storefront/shopNav";
import { itemsLabel } from "@/lib/storefront/i18n";
import { shopRelPath } from "@/lib/storefront/shopHost";
import { BriefcaseIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, GiftIcon, GridIcon, PrinterIcon, SnowflakeIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";
import { LangRow } from "./ShopLangSwitch";

/**
 * Category navigation: the header bar with the «Catalog» mega-menu (≥ 768 px)
 * and the phone sheet («Catalog» in the header row or the bottom nav). The
 * structure comes from `buildShopNav` (layout), so all of them group alike.
 */

type NavCtx = {
  nav: ShopNav;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
};

const Ctx = createContext<NavCtx | null>(null);

export function useShopNav(): NavCtx | null {
  return useContext(Ctx);
}

/** Storefront-relative path («/cani») of a nav link. */
function relPath(l: ShopNavLink): string {
  return l.path.replace(/^\/shop/, "") || "/";
}

/** `path` (storefront-relative) is one of the catalog destinations — bottom-nav highlight. */
export function navHasPath(nav: ShopNav, path: string): boolean {
  const links = [...nav.groups.flatMap((g) => g.links), ...(nav.seasonal ? [nav.seasonal] : [])];
  return links.some((l) => {
    const p = relPath(l);
    return path === p || path.startsWith(`${p}/`);
  });
}

const GROUP_ICONS: Record<ShopNavGroupId, (p: { size?: number; className?: string }) => React.ReactElement> = {
  "photo-gifts": GiftIcon,
  print: PrinterIcon,
  merch: BriefcaseIcon,
};

export function ShopNavProvider({ nav, children }: { nav: ShopNav; children: React.ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  // Navigation closes the sheet (state adjusted during render, no effect).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setSheetOpen(false);
  }
  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const value = useMemo(() => ({ nav, sheetOpen, openSheet, closeSheet }), [nav, sheetOpen, openSheet, closeSheet]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {sheetOpen ? <CatalogSheet nav={nav} onClose={closeSheet} /> : null}
    </Ctx.Provider>
  );
}

function CountPill({ n, className = "" }: { n: number | null; className?: string }) {
  const { lang } = useShopLang();
  if (n == null) return null;
  return (
    <span
      title={itemsLabel(n, lang)}
      className={`grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-(--soft) px-2 text-xs font-bold text-(--muted2) ${className}`}
    >
      <span aria-hidden>{n}</span>
      <span className="sr-only">{itemsLabel(n, lang)}</span>
    </span>
  );
}

function Thumb({ src, size }: { src: string | null; size: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- tiny thumbnail, loaded only while the menu is open
    <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full bg-(--soft) object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="shrink-0 rounded-full bg-(--soft)" style={{ width: size, height: size }} />
  );
}

function isDesktop(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

/** The header's category bar. */
export function ShopCategoryBar() {
  const { t, href } = useShopLang();
  const ctx = useShopNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenuOpen(false);
    };
    // A phone-width window has no mega-menu (the sheet is the menu there).
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => !mq.matches && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      mq.removeEventListener("change", onMq);
    };
  }, [menuOpen]);

  if (!ctx) return null;
  const { nav } = ctx;
  const toggle = () => {
    if (isDesktop()) setMenuOpen((v) => !v);
    else ctx.openSheet();
  };
  const close = () => setMenuOpen(false);
  const seasonal = nav.seasonal;
  const here: string = shopRelPath(pathname ?? "");

  return (
    <nav
      aria-label={t("catalog")}
      className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 pb-2 text-sm font-semibold whitespace-nowrap text-(--muted) sm:px-6 md:gap-4 lg:gap-6"
    >
      <div
        ref={box}
        className="shrink-0"
        onBlur={(e) => {
          // Tabbing out of the button + panel closes the menu.
          if (menuOpen && box.current && e.relatedTarget && !box.current.contains(e.relatedTarget as Node)) setMenuOpen(false);
        }}
      >
        <button
          ref={button}
          type="button"
          aria-expanded={menuOpen}
          aria-controls={panelId}
          aria-haspopup="true"
          onClick={toggle}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-bold ${
            menuOpen ? "bg-(--ink) text-white" : "bg-(--soft) text-(--ink) hover:bg-(--line)"
          }`}
        >
          <GridIcon size={16} />
          {t("catalog")}
          <ChevronDownIcon size={16} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
        </button>
        <div
          id={panelId}
          hidden={!menuOpen}
          className="absolute inset-x-0 top-full z-50 border-y border-(--line) bg-white whitespace-normal shadow-lg"
        >
          {menuOpen ? <MegaMenu nav={nav} onNavigate={close} /> : null}
        </div>
      </div>

      {nav.bar.map((l) => (
        <Link
          key={l.key}
          href={href(l.path)}
          aria-current={here === relPath(l) ? "page" : undefined}
          className={`min-h-10 items-center no-underline aria-[current=page]:text-(--ink) aria-[current=page]:underline aria-[current=page]:underline-offset-8 ${
            l.key === "print-mare-format" ? "hidden lg:inline-flex" : "hidden md:inline-flex"
          }`}
        >
          {l.short}
        </Link>
      ))}
      {seasonal ? (
        <Link
          href={href(seasonal.path)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#eef4fb] px-3 font-bold text-[#1f5d99] no-underline hover:text-[#174a7c] md:bg-transparent md:px-0"
        >
          <SnowflakeIcon size={16} />
          {seasonal.short}
        </Link>
      ) : null}
      <Link href={href("/shop/companii")} className="ml-auto hidden min-h-10 items-center gap-1.5 font-bold text-(--gold-ink) no-underline sm:inline-flex">
        <BriefcaseIcon size={16} />
        {t("forCompanies")}
      </Link>
    </nav>
  );
}

function MegaMenu({ nav, onNavigate }: { nav: ShopNav; onNavigate: () => void }) {
  const { href } = useShopLang();
  const seasonal = nav.seasonal;
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-4 py-5 sm:px-6">
      <div className="grid grid-cols-3 gap-6 lg:gap-10">
        {nav.groups.map((g) => {
          const Icon = GROUP_ICONS[g.id];
          return (
            <section key={g.id} aria-labelledby={`nav-g-${g.id}`} className="flex min-w-0 flex-col gap-1">
              <h2 id={`nav-g-${g.id}`} className="m-0 mb-1 flex items-center gap-2 px-2 text-[13px] font-extrabold tracking-[0.04em] text-(--muted2) uppercase">
                <Icon size={18} className="text-(--gold-ink)" />
                {g.title}
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {g.links.map((l) => (
                  <li key={l.key}>
                    <Link
                      href={href(l.path)}
                      onClick={onNavigate}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 text-[15px] font-semibold text-(--ink) no-underline hover:bg-(--soft)"
                    >
                      <Thumb src={l.image} size={32} />
                      <span className="min-w-0 flex-1">{l.name}</span>
                      <CountPill n={l.count} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {seasonal ? (
        <Link
          href={href(seasonal.path)}
          onClick={onNavigate}
          className="flex min-h-12 items-center gap-3 rounded-xl bg-[#eef4fb] px-4 font-bold text-[#1f5d99] no-underline hover:text-[#174a7c]"
        >
          <SnowflakeIcon size={20} />
          <span className="flex-1">{seasonal.name}</span>
          <CountPill n={seasonal.count} className="bg-white" />
          <ChevronRightIcon size={18} />
        </Link>
      ) : null}
    </div>
  );
}

/** Phone catalog: a full-height sheet above the page (the bottom nav stays on top of it). */
function CatalogSheet({ nav, onClose }: { nav: ShopNav; onClose: () => void }) {
  const { t, href } = useShopLang();
  const sheet = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheet.current) return;
      const f = sheet.current.querySelectorAll<HTMLElement>("a[href], button");
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // Wider than a phone: the header bar takes over.
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => mq.matches && onClose();
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  const seasonal = nav.seasonal;
  const row = "flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-base font-bold text-(--ink) no-underline active:bg-(--soft)";
  return (
    <div
      ref={sheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[45] flex flex-col bg-white md:hidden"
    >
      <div className="flex items-center justify-between border-b border-(--line) px-4 py-3">
        <h2 id={titleId} className="m-0 flex items-center gap-2 text-xl font-extrabold">
          <GridIcon size={20} />
          {t("catalog")}
        </h2>
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          aria-label={t("closeMenu")}
          className="grid h-11 w-11 place-items-center rounded-[10px] bg-(--soft) text-(--ink)"
        >
          <CloseIcon size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-28">
        {seasonal ? (
          <Link href={href(seasonal.path)} onClick={onClose} className={`${row} mb-2 bg-[#eef4fb] text-[#1f5d99]`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white">
              <SnowflakeIcon size={22} />
            </span>
            <span className="flex-1">{seasonal.name}</span>
            <CountPill n={seasonal.count} className="bg-white" />
            <ChevronRightIcon size={18} />
          </Link>
        ) : null}
        {nav.groups.map((g) => {
          const Icon = GROUP_ICONS[g.id];
          return (
            <section key={g.id} aria-labelledby={`sheet-g-${g.id}`} className="mt-3">
              <h3 id={`sheet-g-${g.id}`} className="m-0 flex items-center gap-2 px-3 pb-1 text-[13px] font-extrabold tracking-[0.04em] text-(--muted2) uppercase">
                <Icon size={18} className="text-(--gold-ink)" />
                {g.title}
              </h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {g.links.map((l) => (
                  <li key={l.key}>
                    <Link href={href(l.path)} onClick={onClose} className={row}>
                      <Thumb src={l.image} size={44} />
                      <span className="min-w-0 flex-1">{l.name}</span>
                      <CountPill n={l.count} />
                      <ChevronRightIcon size={18} className="text-(--muted2)" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <Link href={href("/shop/companii")} onClick={onClose} className={`${row} mt-4 border-[1.5px] border-(--line) text-(--gold-ink)`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-(--soft)">
            <BriefcaseIcon size={22} />
          </span>
          <span className="flex-1">{t("forCompanies")}</span>
          <ChevronRightIcon size={18} />
        </Link>
        <LangRow />
      </div>
    </div>
  );
}
