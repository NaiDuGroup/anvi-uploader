"use client";

import { create } from "zustand";
import {
  getDictionary,
  DEFAULT_LOCALE,
  type Locale,
  type TranslationDictionary,
} from "@/lib/i18n";

const STORAGE_KEY = "print-upload-lang";

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ro" || stored === "ru" || stored === "en") return stored;
  return DEFAULT_LOCALE;
}

interface LanguageState {
  locale: Locale;
  t: TranslationDictionary;
  setLocale: (locale: Locale) => void;
}

export const useLanguageStore = create<LanguageState>((set) => {
  const initial = getStoredLocale();
  return {
    locale: initial,
    t: getDictionary(initial),
    setLocale: (locale: Locale) => {
      localStorage.setItem(STORAGE_KEY, locale);
      set({ locale, t: getDictionary(locale) });
    },
  };
});
