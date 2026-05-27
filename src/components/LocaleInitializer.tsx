"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

const STORAGE_KEY = "print-upload-lang";

/**
 * Wraps the root tree so the Zustand language store is mutated to the
 * server-resolved cookie locale BEFORE any descendant renders.
 *
 * Why a wrapper instead of a sibling: an earlier version placed this
 * next to `{children}` in the body, but Next.js 16 wraps async server
 * components (like our `page.tsx`) in implicit Suspense boundaries.
 * That lets sibling subtrees render out-of-order on the server — so
 * `HomePageClient` occasionally read the default ("ro") store value
 * before our `useState` initializer ran, and the SSR HTML shipped in
 * Romanian. Wrapping children guarantees `LocaleInitializer`'s body
 * runs to completion (including the store mutation) before React
 * expands the `{children}` slot, on server AND client.
 *
 * Path A — cookie present (`cookieLocale !== null`):
 *   Mutate the store inside a `useState` initializer so the change
 *   happens during the very first render. SSR markup matches the
 *   first client paint → no `ro → ru` flicker on hard reload or
 *   client navigation back to the home page.
 *
 * Path B — cookie missing (`cookieLocale === null`, legacy session):
 *   Leave the store at its `DEFAULT_LOCALE` default so the existing
 *   `hydrate()` in `HtmlLangUpdater` can fall back to `localStorage`
 *   for users migrating from the pre-cookie version. One flicker
 *   exactly once, then `setLocale` writes the cookie and every
 *   subsequent navigation uses Path A.
 */
export function LocaleInitializer({
  cookieLocale,
  children,
}: {
  cookieLocale: Locale | null;
  children: ReactNode;
}) {
  useState(() => {
    if (cookieLocale === null) return null;
    const state = useLanguageStore.getState();
    if (state.locale !== cookieLocale || !state.hydrated) {
      useLanguageStore.setState({
        locale: cookieLocale,
        t: getDictionary(cookieLocale),
        hydrated: true,
      });
    }
    return null;
  });

  // Mirror cookie → localStorage so the two stores stay aligned for
  // any code path that still reads `print-upload-lang` directly. The
  // cookie is the new source of truth.
  useEffect(() => {
    if (cookieLocale === null) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== cookieLocale) {
        localStorage.setItem(STORAGE_KEY, cookieLocale);
      }
    } catch {
      /* private mode / storage disabled — safe to ignore */
    }
  }, [cookieLocale]);

  return <>{children}</>;
}
