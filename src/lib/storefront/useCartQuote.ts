"use client";

import { useEffect, useState } from "react";
import type { CartLine } from "./cart";
import type { ShopLang } from "./i18n";
import { fetchQuote, type QuoteLineResult } from "./quoteClient";

export type CartQuoteState =
  | { status: "loading"; byId: Record<string, QuoteLineResult> }
  | { status: "done"; byId: Record<string, QuoteLineResult>; subtotal: number | null }
  | { status: "error"; byId: Record<string, QuoteLineResult> };

/** Re-quotes every cart line (one request) whenever the cart's configuration changes. */
export function useCartQuote(lines: CartLine[], lang: ShopLang, enabled: boolean): CartQuoteState {
  const key: string = `${lang}|${JSON.stringify(lines.map((l) => [l.id, l.quote]))}`;
  const [answer, setAnswer] = useState<{
    key: string;
    byId: Record<string, QuoteLineResult>;
    subtotal: number | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const entries = JSON.parse(key.slice(key.indexOf("|") + 1)) as [string, CartLine["quote"]][];
    if (entries.length === 0) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      fetchQuote(
        entries.map(([, q]) => q),
        lang,
        ctrl.signal,
      )
        .then((r) => {
          const byId: Record<string, QuoteLineResult> = {};
          entries.forEach(([id], i) => {
            const res = r.lines[i];
            if (res) byId[id] = res;
          });
          setAnswer({ key, byId, subtotal: r.subtotal, error: false });
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") {
            setAnswer((prev) => ({ key, byId: prev?.byId ?? {}, subtotal: null, error: true }));
          }
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, lang, enabled]);

  if (lines.length === 0) return { status: "done", byId: {}, subtotal: 0 };
  if (answer?.key === key) {
    return answer.error ? { status: "error", byId: answer.byId } : { status: "done", byId: answer.byId, subtotal: answer.subtotal };
  }
  return { status: "loading", byId: answer?.byId ?? {} };
}
