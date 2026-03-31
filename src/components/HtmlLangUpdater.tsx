"use client";

import { useEffect, useLayoutEffect } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function HtmlLangUpdater({
  children,
}: {
  children: React.ReactNode;
}) {
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
    document.documentElement.lang = locale;
  }, [locale]);

  if (!hydrated) return null;

  return <>{children}</>;
}
