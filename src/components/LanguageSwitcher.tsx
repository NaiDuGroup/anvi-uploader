"use client";

import { useLanguageStore } from "@/stores/useLanguageStore";
import { LOCALES, LOCALE_LABELS, LOCALE_FLAGS } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguageStore();

  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((loc: Locale) => (
        <button
          key={loc}
          onClick={() => setLocale(loc)}
          className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
            locale === loc
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
          title={LOCALE_LABELS[loc]}
        >
          {LOCALE_FLAGS[loc]} {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
