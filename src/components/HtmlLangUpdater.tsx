"use client";

import { useEffect, useLayoutEffect } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * `skipLang`: the storefront sets `<html lang>` from its own language
 * (`shop_lang`), so the uploader locale must not overwrite it there.
 */
export function HtmlLangUpdater({ skipLang = false }: { skipLang?: boolean }) {
  const { locale, hydrated, hydrate } = useLanguageStore();

  useIsomorphicLayoutEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useIsomorphicLayoutEffect(() => {
    if (hydrated) {
      document.body.classList.add("hydrated");
    }
  }, [hydrated]);

  useEffect(() => {
    if (skipLang) return;
    document.documentElement.lang = locale;
  }, [locale, skipLang]);

  return null;
}
