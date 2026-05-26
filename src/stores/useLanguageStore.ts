"use client";

import { create } from "zustand";
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

interface LanguageState {
  locale: Locale;
  t: TranslationDictionary;
  hydrated: boolean;
  setLocale: (locale: Locale) => void;
  hydrate: () => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
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
