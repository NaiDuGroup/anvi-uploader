"use client";

import { useEffect } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";

export function HtmlLangUpdater() {
  const { locale, hydrated, hydrate } = useLanguageStore();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
