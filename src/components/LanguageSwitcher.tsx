"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { LOCALES, LOCALE_LABELS, LOCALE_FLAGS } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { ChevronDown } from "lucide-react";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguageStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, handleClose]);

  const handleSelect = (loc: Locale) => {
    setLocale(loc);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{LOCALE_FLAGS[locale]}</span>
        <span>{locale.toUpperCase()}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-activedescendant={`lang-${locale}`}
          className="absolute right-0 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-50"
        >
          {LOCALES.map((loc: Locale) => (
            <li
              key={loc}
              id={`lang-${loc}`}
              role="option"
              aria-selected={loc === locale}
              onClick={() => handleSelect(loc)}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                loc === locale
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{LOCALE_FLAGS[loc]}</span>
              <span>{LOCALE_LABELS[loc]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
