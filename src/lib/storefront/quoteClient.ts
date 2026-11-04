"use client";

import { useEffect, useState } from "react";
import type { ShopLang } from "./i18n";
import type { ShopQuoteLine } from "./types";

/** Answer of `POST /api/public/quote` (see `src/lib/publicQuote/publicQuote.ts`). */
export type QuoteLineResult =
  | {
      ok: true;
      quantity: number;
      unitPrice: number;
      total: number;
      breakdown?: { key: string; label: string; amount: number }[];
    }
  | { ok: false; reason: "price_unavailable" | "invalid"; code: string };

export interface QuoteResult {
  currency: "MDL";
  lines: QuoteLineResult[];
  subtotal: number | null;
}

export async function fetchQuote(lines: ShopQuoteLine[], lang: ShopLang, signal?: AbortSignal): Promise<QuoteResult> {
  const res = await fetch("/api/public/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines, locale: lang }),
    signal,
  });
  if (!res.ok) throw new Error(`quote_${res.status}`);
  return (await res.json()) as QuoteResult;
}

export type LiveQuoteState =
  | { status: "idle" }
  | { status: "loading"; previous: QuoteLineResult | null }
  | { status: "done"; line: QuoteLineResult }
  | { status: "error" };

/** Price of one configured line, re-quoted (debounced) whenever it changes. */
export function useLiveQuote(line: ShopQuoteLine | null, lang: ShopLang): LiveQuoteState {
  const key: string | null = line ? `${lang}|${JSON.stringify(line)}` : null;
  // Last answer and the configuration it was for; the status is derived from it.
  const [answer, setAnswer] = useState<{ key: string; line: QuoteLineResult | null } | null>(null);

  useEffect(() => {
    if (key == null) return;
    const ctrl = new AbortController();
    const body = JSON.parse(key.slice(key.indexOf("|") + 1)) as ShopQuoteLine;
    const timer = window.setTimeout(() => {
      fetchQuote([body], lang, ctrl.signal)
        .then((r) => setAnswer({ key, line: r.lines[0] ?? null }))
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") setAnswer({ key, line: null });
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, lang]);

  if (key == null) return { status: "idle" };
  if (answer?.key === key) return answer.line ? { status: "done", line: answer.line } : { status: "error" };
  return { status: "loading", previous: answer?.line ?? null };
}
