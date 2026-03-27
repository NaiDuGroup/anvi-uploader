"use client";

import { useEffect } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";

export function HtmlLangUpdater() {
  const { locale } = useLanguageStore();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
