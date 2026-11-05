"use client";

import { createContext, createElement, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  getDictionary,
  DEFAULT_LOCALE,
  type Locale,
  type TranslationDictionary,
} from "@/lib/i18n";

const STORAGE_KEY = "print-upload-lang";
const LOCALE_COOKIE = "locale";

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ro" || stored === "ru" || stored === "en") return stored;
  return null;
}

function persistLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

export interface LanguageState {
  locale: Locale;
  t: TranslationDictionary;
  hydrated: boolean;
  setLocale: (locale: Locale) => void;
  hydrate: () => void;
}

const languageStore = createStore<LanguageState>((set) => ({
  locale: DEFAULT_LOCALE,
  t: getDictionary(DEFAULT_LOCALE),
  hydrated: false,
  setLocale: (locale: Locale) => {
    persistLocale(locale);
    set({ locale, t: getDictionary(locale) });
  },
  hydrate: () => {
    const stored = readStoredLocale();
    if (stored) {
      persistLocale(stored);
      set({ locale: stored, t: getDictionary(stored), hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },
}));

/**
 * The locale the server resolved for this request (the `locale` cookie), or
 * null when there is none. Provided by `LocaleInitializer` at the root.
 */
const ServerLocaleContext = createContext<Locale | null>(null);

export function ServerLocaleProvider({ locale, children }: { locale: Locale | null; children?: ReactNode }) {
  return createElement(ServerLocaleContext.Provider, { value: locale }, children);
}

// One frozen snapshot per locale: `useSyncExternalStore` needs a stable value.
const serverSnapshots = new Map<Locale, LanguageState>();

/**
 * The state used for the server render and for hydration. A plain zustand
 * hook would use the store's *initial* state here (always Romanian), so pages
 * rendered for a Russian user were Romanian until hydration finished — a
 * visible flash. With the request's cookie locale both sides agree on it.
 */
export function serverLanguageSnapshot(locale: Locale | null): LanguageState {
  if (locale === null) return languageStore.getInitialState();
  let snap = serverSnapshots.get(locale);
  if (!snap) {
    const { setLocale, hydrate } = languageStore.getInitialState();
    snap = { locale, t: getDictionary(locale), hydrated: true, setLocale, hydrate };
    serverSnapshots.set(locale, snap);
  }
  return snap;
}

const identity = (s: LanguageState): LanguageState => s;

function useLanguageStoreHook(): LanguageState;
function useLanguageStoreHook<U>(selector: (state: LanguageState) => U): U;
function useLanguageStoreHook<U>(selector?: (state: LanguageState) => U): U {
  const select = (selector ?? identity) as (state: LanguageState) => U;
  const serverLocale = useContext(ServerLocaleContext);
  const getSnapshot = useCallback(() => select(languageStore.getState()), [select]);
  const getServerSnapshot = useCallback(() => select(serverLanguageSnapshot(serverLocale)), [select, serverLocale]);
  return useSyncExternalStore(languageStore.subscribe, getSnapshot, getServerSnapshot);
}

/** Same API as a zustand `create` hook (`useLanguageStore()`, `.getState()`, `.setState()`, `.subscribe()`). */
export const useLanguageStore = Object.assign(useLanguageStoreHook, languageStore) as UseBoundStore<StoreApi<LanguageState>>;
