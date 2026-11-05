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

/** Longest single wait before re-asking after HTTP 429 (the server window may be longer). */
const MAX_RETRY_WAIT_MS = 30_000;
/** How many times a rate-limited quote is re-asked before giving up with an error. */
const MAX_RATE_LIMIT_RETRIES = 6;

/** Wait before retrying a 429: the server's `Retry-After` seconds, clamped to 1–30 s. */
export function retryAfterMs(header: string | null, attempt: number): number {
  const sec = header != null ? Number(header) : NaN;
  const base = Number.isFinite(sec) && sec > 0 ? sec * 1000 : 2000 * 2 ** attempt;
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(1000, base));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Price the lines. On HTTP 429 it waits for `Retry-After` and asks again
 * (the caller keeps showing «recalculating» meanwhile); `onRateLimited` lets
 * the UI say so. Aborting the signal (a newer configuration) stops the wait.
 */
export async function fetchQuote(
  lines: ShopQuoteLine[],
  lang: ShopLang,
  signal?: AbortSignal,
  onRateLimited?: () => void,
): Promise<QuoteResult> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("/api/public/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, locale: lang }),
      signal,
    });
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      onRateLimited?.();
      await sleep(retryAfterMs(res.headers.get("Retry-After"), attempt), signal);
      continue;
    }
    if (!res.ok) throw new Error(`quote_${res.status}`);
    return (await res.json()) as QuoteResult;
  }
}

export type LiveQuoteState =
  | { status: "idle" }
  /** `rateLimited`: the server said «too many requests»; we wait and ask again. */
  | { status: "loading"; previous: QuoteLineResult | null; rateLimited: boolean }
  | { status: "done"; line: QuoteLineResult }
  | { status: "error" };

/** Price of one configured line, re-quoted (debounced) whenever it changes. */
export function useLiveQuote(line: ShopQuoteLine | null, lang: ShopLang): LiveQuoteState {
  const key: string | null = line ? `${lang}|${JSON.stringify(line)}` : null;
  // Last answer and the configuration it was for; the status is derived from it.
  const [answer, setAnswer] = useState<{ key: string; line: QuoteLineResult | null } | null>(null);
  const [limitedKey, setLimitedKey] = useState<string | null>(null);

  useEffect(() => {
    if (key == null) return;
    const ctrl = new AbortController();
    const body = JSON.parse(key.slice(key.indexOf("|") + 1)) as ShopQuoteLine;
    const timer = window.setTimeout(() => {
      fetchQuote([body], lang, ctrl.signal, () => setLimitedKey(key))
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
  return { status: "loading", previous: answer?.line ?? null, rateLimited: limitedKey === key };
}
