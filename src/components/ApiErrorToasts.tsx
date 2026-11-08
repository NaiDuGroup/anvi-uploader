"use client";

/**
 * Global «something went wrong» toasts for client requests to our own API.
 *
 * Mounted once per area (admin, cabinet, shop). It wraps `window.fetch` for
 * same-origin `/api/` calls and, when a request fails, shows a friendly
 * sonner toast by status (401 session, 403 rights, 5xx not saved, offline…).
 *
 * No double messages:
 * - GET (page loads, polling, badges) only reports 401; the rest is left to
 *   the page. Repeats of the same toast are throttled; «offline» shows once
 *   until the next successful response.
 * - For mutations the toast waits a moment and is dropped if the calling
 *   component showed its own error meanwhile: a sonner toast, `alert()`, or
 *   new error text in the DOM (`role="alert"`, red text, or the server text).
 * - Per call opt-out: header `x-no-error-toast: 1` (stripped before sending).
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { Locale } from "@/lib/i18n/types";
import { apiErrorsDict } from "@/lib/i18n/apiErrors";
import {
  NO_ERROR_TOAST_HEADER,
  createErrorDeduper,
  decideToast,
  describeApiError,
  serverMessageFromBody,
  shouldWatchUrl,
} from "@/lib/http/apiErrorMessage";

type Config = {
  locale: Locale;
  audience: "staff" | "customer";
  loginHref?: string;
  /**
   * GET endpoint that answers 200 while this area's own session is alive
   * (cabinet: `/api/cabinet/me`). A 401 from some other endpoint (staff-only
   * `/api/admin/*`, `/api/download/*`…) then means «no rights», not «session
   * expired»: staff routes answer 401 to anyone without a staff session.
   */
  sessionProbe?: string;
};

/** Cached probe result so a burst of 401s costs one request. */
let probeCache: { url: string; at: number; alive: Promise<boolean> } | null = null;
const PROBE_TTL_MS = 10_000;

function ownSessionAlive(probeUrl: string, original: typeof fetch): Promise<boolean> {
  const now = Date.now();
  if (probeCache && probeCache.url === probeUrl && now - probeCache.at < PROBE_TTL_MS) return probeCache.alive;
  const alive = original(probeUrl, { cache: "no-store", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false);
  probeCache = { url: probeUrl, at: now, alive };
  return alive;
}

function isSameEndpoint(url: string, probeUrl: string): boolean {
  try {
    return new URL(url, window.location.origin).pathname === new URL(probeUrl, window.location.origin).pathname;
  } catch {
    return false;
  }
}

/** How long a component gets to show its own error before the toast appears. */
const OWN_ERROR_GRACE_MS = 700;

const ERROR_SELECTOR = [
  '[role="alert"]',
  '[aria-live="assertive"]',
  '[class*="text-red-"]',
  '[class*="text-rose-"]',
  '[class*="text-(--err)"]',
  '[class*="text-destructive"]',
  "[data-error]",
].join(",");

declare global {
  interface Window {
    __apiErrorToasts?: { config: Config; refs: number; original: typeof fetch; lastAlertAt: number };
  }
}

const deduper = createErrorDeduper({ windowMs: 8000, stickyKeys: ["offline"] });

function isAuthPage(): boolean {
  return /\/(login|register)(\/|$)/.test(window.location.pathname);
}

function headersOf(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (init?.headers) return new Headers(init.headers);
  if (typeof Request !== "undefined" && input instanceof Request) return input.headers;
  return new Headers();
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Starts watching the page right away (before the caller sees the response),
 * so an error the component renders in the same tick is not missed.
 * `settle(serverMsg)` resolves true if the page showed its own error within
 * the grace period.
 */
function watchForOwnError(): { settle: (serverMsg: string | null) => Promise<boolean> } {
  const startedAt = Date.now();
  const startToasts = toast.getHistory().length;
  const startAlert = window.__apiErrorToasts?.lastAlertAt ?? 0;
  let handled = false;
  const addedTexts: string[] = [];

  const check = (el: Element | null) => {
    if (handled || !el) return;
    if (el.closest("[data-sonner-toaster]") || el.closest("button")) return;
    const text = el.textContent?.trim();
    if (!text) return;
    if (el.closest(ERROR_SELECTOR) || el.querySelector(ERROR_SELECTOR)?.textContent?.trim()) {
      handled = true;
      return;
    }
    if (addedTexts.length < 50) addedTexts.push(text);
  };

  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") check(r.target.parentElement);
      else r.addedNodes.forEach((n) => check(n.nodeType === 1 ? (n as Element) : n.parentElement));
      if (handled) break;
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });

  return {
    settle: (serverMsg) =>
      new Promise((resolve) => {
        const wait = Math.max(0, OWN_ERROR_GRACE_MS - (Date.now() - startedAt));
        window.setTimeout(() => {
          obs.disconnect();
          const ownToast = toast.getHistory().length > startToasts;
          const ownAlert = (window.__apiErrorToasts?.lastAlertAt ?? 0) > startAlert;
          const showsServerText =
            !!serverMsg && serverMsg.length >= 4 && addedTexts.some((t) => t.includes(serverMsg));
          resolve(handled || ownToast || ownAlert || showsServerText);
        }, wait);
      }),
  };
}

function show(cfg: Config, status: number | null, serverMsg: string | null) {
  const msg = describeApiError({ locale: cfg.locale, status, serverMessage: serverMsg, audience: cfg.audience });
  if (!deduper.take(msg.key)) return;
  const t = apiErrorsDict(cfg.locale);
  const opts: Parameters<typeof toast.error>[1] = { id: `api-error:${msg.key}`, description: msg.description };
  if (msg.kind === "unauthorized" && cfg.loginHref) {
    const href = cfg.loginHref;
    opts.action = { label: t.signIn, onClick: () => window.location.assign(href) };
    opts.duration = 15000;
  }
  if (msg.kind === "offline") toast.warning(msg.title, opts);
  else toast.error(msg.title, opts);
}

async function report(
  method: string,
  res: Response | null,
  mutation: boolean,
  watcher: ReturnType<typeof watchForOwnError> | null,
  url: string,
): Promise<void> {
  const state = window.__apiErrorToasts;
  const cfg = state?.config;
  let status = res ? res.status : null;
  // Signed-in customer hitting a staff-only endpoint: the route says 401
  // (no staff session), but their own session is fine — it is a 403.
  if (status === 401 && state && cfg?.sessionProbe && !isSameEndpoint(url, cfg.sessionProbe)) {
    if (await ownSessionAlive(cfg.sessionProbe, state.original)) status = 403;
  }
  const skip =
    !state ||
    !cfg ||
    state.refs <= 0 || // no covered area is mounted (e.g. /track after leaving /admin)
    isAuthPage() ||
    (status === 401 && cfg.audience === "customer") || // guests get 401 from account probes
    decideToast(method, status) === "skip";
  if (skip) {
    void watcher?.settle(null); // disconnects the observer
    return;
  }

  let serverMsg: string | null = null;
  if (res) {
    try {
      serverMsg = serverMessageFromBody(await res.json());
    } catch {
      serverMsg = null;
    }
  }
  // 401 on any call: the whole page is dead, say it even if the component also did.
  const own = watcher ? await watcher.settle(serverMsg) : false;
  if (status !== 401 && mutation && own) return;
  show(window.__apiErrorToasts?.config ?? cfg, status, serverMsg);
}

function install(config: Config) {
  const existing = window.__apiErrorToasts;
  if (existing) {
    existing.config = config;
    existing.refs += 1;
    return;
  }
  const original = window.fetch.bind(window);
  const nativeAlert = window.alert.bind(window);
  const state = { config, refs: 1, original, lastAlertAt: 0 };
  window.__apiErrorToasts = state;
  window.alert = (message?: unknown) => {
    state.lastAlertAt = Date.now();
    nativeAlert(message as string);
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: string;
    try {
      url = urlOf(input);
    } catch {
      return original(input, init);
    }
    if (!shouldWatchUrl(url, window.location.origin)) return original(input, init);

    const headers = headersOf(input, init);
    if (headers.has(NO_ERROR_TOAST_HEADER)) {
      if (init?.headers) {
        const h = new Headers(init.headers);
        h.delete(NO_ERROR_TOAST_HEADER);
        init = { ...init, headers: h };
      }
      return original(input, init);
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);

    let res: Response;
    try {
      res = await original(input, init);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      // GET failing while the browser is online is usually a page navigation — stay quiet.
      if (!aborted && (mutation || navigator.onLine === false)) {
        void report(method, null, mutation, mutation ? watchForOwnError() : null, url);
      }
      throw err;
    }
    if (res.ok) {
      deduper.reset("offline");
    } else if (res.status !== 304) {
      let copy: Response | null = null;
      try {
        copy = res.clone();
      } catch {
        copy = null;
      }
      // 401 normally ignores the page's own error; keep watching when it may turn into a 403.
      const watcher =
        mutation && (res.status !== 401 || !!state.config.sessionProbe) ? watchForOwnError() : null;
      void report(method, copy ?? new Response(null, { status: res.status }), mutation, watcher, url);
    }
    return res;
  };

  window.addEventListener("online", () => deduper.reset("offline"));
}

function uninstall() {
  const state = window.__apiErrorToasts;
  if (!state) return;
  state.refs -= 1;
  // Keep the wrapper installed: other areas mount it too and restoring fetch
  // under a third-party wrapper would break it. Refcount only for config.
}

/**
 * Mount once in an area layout. `shopLang` makes it follow the storefront
 * language; otherwise it uses the admin/cabinet language store.
 */
export function ApiErrorToasts({
  shopLang,
  loginHref,
  audience = "staff",
  sessionProbe,
}: {
  shopLang?: Locale;
  loginHref?: string;
  audience?: "staff" | "customer";
  sessionProbe?: string;
}) {
  const storeLocale = useLanguageStore((s) => s.locale);
  const locale = shopLang ?? storeLocale;
  const installed = useRef(false);

  useEffect(() => {
    const config: Config = { locale, audience, loginHref, sessionProbe };
    if (!installed.current) {
      install(config);
      installed.current = true;
    } else if (window.__apiErrorToasts) {
      window.__apiErrorToasts.config = config;
    }
  }, [locale, audience, loginHref, sessionProbe]);

  useEffect(
    () => () => {
      uninstall();
      installed.current = false;
    },
    [],
  );

  return null;
}
