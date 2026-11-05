"use client";

import { useEffect, useRef, useState } from "react";
import { TURNSTILE_SCRIPT_URL, type TurnstileAction } from "@/lib/turnstile/config";
import { registerTurnstileWidget, type TurnstileWidgetState } from "@/lib/turnstile/client";
import { parseTurnstileLang, turnstileText, type TurnstileLang } from "@/lib/turnstile/texts";

/**
 * Invisible Cloudflare Turnstile widget (managed mode, `interaction-only`):
 * nothing is shown unless Cloudflare wants a click, and then it pops up
 * fixed at the bottom of the screen — no layout shift. Rendered only by
 * `TurnstileScope` on the pages that need it, which is also the only place
 * the Cloudflare script is loaded.
 */

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string | undefined;
  reset(id?: string): void;
  remove(id?: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TURNSTILE_SCRIPT_URL;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
      s.onerror = () => reject(new Error("turnstile script failed"));
      document.head.appendChild(s);
    }).catch((e: unknown) => {
      scriptPromise = null;
      throw e;
    });
  }
  return scriptPromise;
}

/** A visitor solving an interactive challenge gets this long before we give up. */
const INTERACTIVE_TIMEOUT_MS = 90_000;

export function TurnstileWidget({ siteKey, action, lang }: { siteKey: string; action: TurnstileAction; lang?: TurnstileLang }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  const resetRef = useRef<() => void>(() => {});

  useEffect(() => {
    let state: TurnstileWidgetState = "loading";
    let token: string | null = null;
    let widgetId: string | undefined;
    let api: TurnstileApi | null = null;
    let disposed = false;
    const waiters: Array<(t: string | null) => void> = [];

    const reset = () => {
      token = null;
      if (api && widgetId) {
        state = "loading";
        api.reset(widgetId);
      }
    };
    resetRef.current = () => {
      setError(false);
      if (state === "unavailable" && !api) start();
      else reset();
    };
    const flush = (value: string | null) => {
      while (waiters.length) waiters.shift()!(value);
    };
    const onToken = (t: string) => {
      state = "ready";
      setError(false);
      const w = waiters.shift();
      if (w) {
        w(t);
        reset(); // single-use: get the next one now
      } else token = t;
    };
    const onUnavailable = () => {
      state = "unavailable";
      token = null;
      flush(null);
    };

    const start = () => {
      state = "loading";
      loadTurnstile()
        .then((t) => {
          if (disposed || !boxRef.current) return;
          api = t;
          widgetId = t.render(boxRef.current, {
            sitekey: siteKey,
            action,
            appearance: "interaction-only",
            language: lang ?? parseTurnstileLang(safeStoredLang()) ?? "auto",
            "refresh-expired": "auto",
            callback: onToken,
            "expired-callback": () => {
              token = null;
            },
            "error-callback": () => {
              onUnavailable();
              return true;
            },
            "before-interactive-callback": () => {
              state = "interactive";
            },
          });
        })
        .catch(() => {
          if (!disposed) onUnavailable();
        });
    };

    const unregister = registerTurnstileWidget({
      state: () => state,
      reset,
      showError: () => setError(true),
      takeToken: (timeoutMs) => {
        if (token) {
          const t = token;
          reset();
          return Promise.resolve(t);
        }
        if (state === "unavailable") return Promise.resolve(null);
        return new Promise<string | null>((resolve) => {
          let done = false;
          const finish = (v: string | null) => {
            if (done) return;
            done = true;
            const i = waiters.indexOf(finish);
            if (i >= 0) waiters.splice(i, 1);
            resolve(v);
          };
          waiters.push(finish);
          const startedAt = Date.now();
          const tick = () => {
            if (done) return;
            const limit = state === "interactive" ? INTERACTIVE_TIMEOUT_MS : timeoutMs;
            if (Date.now() - startedAt >= limit) finish(null);
            else setTimeout(tick, 500);
          };
          setTimeout(tick, 500);
        });
      },
    });
    start();

    return () => {
      disposed = true;
      unregister();
      flush(null);
      if (api && widgetId) api.remove(widgetId);
    };
  }, [siteKey, action, lang]);

  // Shown only after a failed check (client-only): walk-in pages keep their language in localStorage.
  const uiLang = () => lang ?? parseTurnstileLang(safeStoredLang());

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
      <div ref={boxRef} className="pointer-events-auto" />
      {error && (
        <div
          role="alert"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-800 shadow-lg"
        >
          <span>{turnstileText(uiLang(), "failed")}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white"
            onClick={() => resetRef.current()}
          >
            {turnstileText(uiLang(), "retry")}
          </button>
        </div>
      )}
    </div>
  );
}

function safeStoredLang(): string | null {
  try {
    return localStorage.getItem("print-upload-lang");
  } catch {
    return null;
  }
}
