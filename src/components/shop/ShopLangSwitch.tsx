"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { SHOP_LANG_COOKIE, SHOP_LANGS, shopT, type ShopLang, type ShopStringKey } from "@/lib/storefront/i18n";
import { SHOP_LANG_NAMES, hasShopLangChoice, shopLangSuggestion } from "@/lib/storefront/langSuggest";
import { CheckIcon, ChevronDownIcon, CloseIcon, GlobeIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

/**
 * Storefront language controls. The language is the `shop_lang` cookie (one
 * URL per page, Romanian for crawlers — see `shopSeo.ts`): a switch writes
 * the cookie and refreshes the server components in place, so the page, its
 * scroll and the cart (localStorage) stay as they are.
 */

export function writeShopLangCookie(lang: ShopLang): void {
  try {
    document.cookie = `${SHOP_LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked: the switch still works for this page view.
  }
}

/** `pick(lang)`: remember the choice (also when it is the current one) and re-render in it. */
export function useShopLangSwitch(): { lang: ShopLang; pick: (next: ShopLang) => void; pending: boolean } {
  const { lang } = useShopLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = useCallback(
    (next: ShopLang) => {
      writeShopLangCookie(next);
      if (next === lang) return;
      // A `?lang=` in the address would win over the cookie: drop it.
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.delete("lang");
        start(() => router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false }));
        return;
      }
      start(() => router.refresh());
    },
    [lang, router],
  );
  return { lang, pick, pending };
}

/** Header button: globe + «RO» + chevron, opening a menu of the three languages (endonyms). */
export function LangMenu() {
  const { t } = useShopLang();
  const { lang, pick, pending } = useShopLangSwitch();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const current = SHOP_LANGS.indexOf(lang);

  useEffect(() => {
    if (open) items.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openAt = (i: number) => {
    setActive(i);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const n = SHOP_LANGS.length;

  return (
    <div
      ref={box}
      className="relative"
      aria-busy={pending}
      onBlur={(e) => {
        // Tabbing out of the button + menu closes it.
        if (open && box.current && e.relatedTarget && !box.current.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("langCurrent", { name: SHOP_LANG_NAMES[lang] })}
        title={t("langLabel")}
        onClick={() => (open ? close(false) : openAt(current))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openAt(e.key === "ArrowDown" ? current : n - 1);
          }
        }}
        className={`inline-flex h-11 items-center gap-1 rounded-[10px] px-2.5 text-sm font-bold uppercase sm:gap-1.5 sm:px-3 ${
          open ? "bg-(--ink) text-white" : "bg-(--soft) text-(--ink) hover:bg-(--line)"
        } ${pending ? "opacity-70" : ""}`}
      >
        <GlobeIcon size={18} />
        <span aria-hidden>{lang}</span>
        <ChevronDownIcon size={16} className={`hidden transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("langLabel")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % n);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + n) % n);
            } else if (e.key === "Home") {
              e.preventDefault();
              setActive(0);
            } else if (e.key === "End") {
              e.preventDefault();
              setActive(n - 1);
            } else if (e.key === "Tab") {
              setOpen(false);
            }
          }}
          className="absolute top-full right-0 z-50 mt-2 flex w-48 max-sm:right-auto max-sm:left-1/2 max-sm:-translate-x-1/2 flex-col rounded-xl border border-(--line) bg-white p-1.5 shadow-lg"
        >
          {SHOP_LANGS.map((l, i) => {
            const isCurrent = l === lang;
            return (
              <button
                key={l}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                aria-current={isCurrent ? "true" : undefined}
                tabIndex={i === active ? 0 : -1}
                lang={l}
                onClick={() => {
                  close(true);
                  pick(l);
                }}
                onPointerEnter={() => setActive(i)}
                className={`flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-left text-[15px] text-(--ink) hover:bg-(--soft) focus-visible:bg-(--soft) ${
                  isCurrent ? "font-bold" : "font-semibold"
                }`}
              >
                <span className="grid w-5 shrink-0 place-items-center text-(--gold-ink)">{isCurrent ? <CheckIcon size={18} /> : null}</span>
                <span className="flex-1">{SHOP_LANG_NAMES[l]}</span>
                <span aria-hidden className="text-xs font-bold text-(--muted2) uppercase">
                  {l}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Language row at the bottom of the phone catalog sheet. */
export function LangRow() {
  const { t } = useShopLang();
  const { lang, pick, pending } = useShopLangSwitch();
  return (
    <section aria-labelledby="sheet-lang" className="mt-6 border-t border-(--line) px-3 pt-4">
      <h3 id="sheet-lang" className="m-0 flex items-center gap-2 pb-2 text-[13px] font-extrabold tracking-[0.04em] text-(--muted2) uppercase">
        <GlobeIcon size={18} className="text-(--gold-ink)" />
        {t("langLabel")}
      </h3>
      <div role="group" aria-labelledby="sheet-lang" aria-busy={pending} className="grid grid-cols-3 gap-2">
        {SHOP_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={l === lang}
            onClick={() => pick(l)}
            className={`min-h-12 rounded-xl px-2 text-[15px] font-bold ${
              l === lang ? "bg-(--ink) text-white" : "bg-(--soft) text-(--ink) active:bg-(--line)"
            }`}
          >
            {SHOP_LANG_NAMES[l]}
          </button>
        ))}
      </div>
    </section>
  );
}

const noopSubscribe = () => () => {};

/** Suggested language for this visitor, read in the browser only (null on the server and for bots). */
function useLangSuggestion(current: ShopLang): ShopLang | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
        return shopLangSuggestion({
          current,
          chosen: hasShopLangChoice(document.cookie),
          browserLangs: langs,
          userAgent: navigator.userAgent,
        });
      } catch {
        return null;
      }
    },
    () => null,
  );
}

/**
 * First-visit hint: «Сайт есть на русском языке [Перейти] [Остаться на
 * румынском]», in the suggested language. Any answer (or ×) writes the
 * cookie, so it never shows again. No redirect, nothing server-side.
 */
export function LangSuggestBanner() {
  const { lang } = useShopLang();
  const { pick } = useShopLangSwitch();
  const suggestion = useLangSuggestion(lang);
  const [answered, setAnswered] = useState(false);
  if (!suggestion || answered) return null;
  const ts = shopT(suggestion);
  const stayKey = `langSuggestStay_${lang}` as ShopStringKey;
  const answer = (next: ShopLang) => {
    setAnswered(true);
    pick(next);
  };
  return (
    <div
      role="region"
      aria-label={ts("langLabel")}
      lang={suggestion}
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-(--line) bg-(--soft) py-2 pr-12 pl-4 text-sm text-(--ink) relative"
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        <GlobeIcon size={16} className="text-(--gold-ink)" />
        {ts("langSuggestText")}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => answer(suggestion)} className="min-h-9 rounded-lg bg-(--ink) px-3 font-bold text-white">
          {ts("langSuggestGo")}
        </button>
        <button type="button" onClick={() => answer(lang)} className="min-h-9 rounded-lg px-2 font-semibold text-(--muted) underline underline-offset-4 hover:text-(--ink)">
          {ts(stayKey)}
        </button>
      </span>
      <button
        type="button"
        onClick={() => answer(lang)}
        aria-label={ts("closeMenu")}
        className="absolute top-1/2 right-2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-(--muted2) hover:bg-(--line)"
      >
        <CloseIcon size={18} />
      </button>
    </div>
  );
}

/** Footer language links: «🌐 Română · Русский · English», current one bold. */
export function FooterLangLinks() {
  const { t } = useShopLang();
  const { lang, pick, pending } = useShopLangSwitch();
  return (
    <div role="group" aria-label={t("langLabel")} aria-busy={pending} className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
      <GlobeIcon size={16} className="mr-1 text-(--muted2)" />
      {SHOP_LANGS.map((l, i) => (
        <span key={l} className="inline-flex items-center">
          {i > 0 ? <span aria-hidden="true" className="px-1.5 text-(--muted2)">·</span> : null}
          <button
            type="button"
            lang={l}
            aria-current={l === lang ? "true" : undefined}
            onClick={() => pick(l)}
            className={`min-h-10 px-0.5 ${l === lang ? "font-extrabold text-(--ink)" : "text-(--muted) hover:text-(--ink) hover:underline"}`}
          >
            {SHOP_LANG_NAMES[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
