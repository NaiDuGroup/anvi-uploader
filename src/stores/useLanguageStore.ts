"use client";

import { create } from "zustand";
import {
  getDictionary,
  DEFAULT_LOCALE,
  type Locale,
  type TranslationDictionary,
} from "@/lib/i18n";

const STORAGE_KEY = "print-upload-lang";

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ro" || stored === "ru" || stored === "en") return stored;
  return null;
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
    localStorage.setItem(STORAGE_KEY, locale);
    set({ locale, t: getDictionary(locale) });
  },
  hydrate: () => {
    const stored = readStoredLocale();
    if (stored) {
      set({ locale: stored, t: getDictionary(stored), hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },
}));
