/**
 * Storefront funnel tracker (browser only): first-party, no cookies, no
 * third parties. Events go in batches to `/api/shop/e` with
 * `navigator.sendBeacon`. The session is a random id in sessionStorage (one
 * per tab, gone when the tab closes); the landing referrer domain and utm
 * tags are kept there too. Nothing is sent when the browser asks not to be
 * tracked (Do Not Track / Global Privacy Control) or looks automated.
 * Every call is fire-and-forget and never throws.
 */
import {
  browserOptsOut,
  isBotUserAgent,
  redactShopPath,
  type ShopEventDevice,
  type ShopEventInput,
  type ShopEventType,
  SHOP_EVENTS_MAX_BATCH,
} from "@/lib/shop/analytics/events";

const ENDPOINT = "/api/shop/e";
const SID_KEY = "anvi_sid";
const SRC_KEY = "anvi_src";
const PAY_KEY = "anvi_pay";
const FLUSH_MS = 2000;

interface Landing {
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

let queue: ShopEventInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let enabledCache: boolean | null = null;
let listening = false;

function ss(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function enabled(): boolean {
  if (enabledCache != null) return enabledCache;
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
    enabledCache =
      !browserOptsOut(nav, window as unknown as { doNotTrack?: string | null }) &&
      !nav.webdriver &&
      !isBotUserAgent(nav.userAgent) &&
      typeof nav.sendBeacon === "function";
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

function randomId(): string {
  try {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function sessionId(): string {
  const s = ss();
  let id = s?.getItem(SID_KEY) ?? null;
  if (!id) {
    id = randomId();
    try {
      s?.setItem(SID_KEY, id);
    } catch {
      // Storage full / blocked: the id lives for this page only.
    }
  }
  return id;
}

/** Referrer domain + utm tags of the session's first page (external referrers only). */
function landing(): Landing {
  const s = ss();
  try {
    const saved = s?.getItem(SRC_KEY);
    if (saved) return JSON.parse(saved) as Landing;
  } catch {
    // Unreadable: capture again.
  }
  const out: Landing = {};
  try {
    const q = new URLSearchParams(window.location.search);
    const utm = (k: string) => q.get(k)?.trim().slice(0, 100) || undefined;
    out.utmSource = utm("utm_source");
    out.utmMedium = utm("utm_medium");
    out.utmCampaign = utm("utm_campaign");
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, "");
      const own = window.location.hostname.toLowerCase().replace(/^www\./, "");
      // Our own hosts (anvi.md ↔ print.anvi.md) are not a source.
      if (host && host !== own && host !== "anvi.md" && !host.endsWith(".anvi.md")) out.ref = host;
    }
  } catch {
    // Malformed referrer: no source.
  }
  try {
    s?.setItem(SRC_KEY, JSON.stringify(out));
  } catch {
    // Ignore.
  }
  return out;
}

function device(): ShopEventDevice {
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return coarse || window.innerWidth < 768 ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

/** Send what is queued (beacon; `fetch keepalive` when the beacon is refused). */
export function flushShopEvents(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  while (queue.length) {
    const batch = queue.slice(0, SHOP_EVENTS_MAX_BATCH);
    queue = queue.slice(SHOP_EVENTS_MAX_BATCH);
    const body = JSON.stringify({ events: batch });
    let sent = false;
    try {
      // text/plain: a «simple» request, no CORS preflight.
      sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
    } catch {
      sent = false;
    }
    if (!sent) {
      try {
        void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain;charset=UTF-8" } }).catch(() => {});
      } catch {
        // Give up silently: statistics never break the page.
      }
    }
  }
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("pagehide", flushShopEvents);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushShopEvents();
  });
}

/** Record one funnel event (batched). */
export function trackShopEvent(
  type: ShopEventType,
  data: { category?: string; product?: string; path?: string } = {},
): void {
  if (typeof window === "undefined" || !enabled()) return;
  try {
    const lang = document.documentElement.lang || undefined;
    queue.push({
      type,
      sid: sessionId(),
      path: redactShopPath(data.path ?? window.location.pathname),
      ...(data.category ? { category: data.category } : {}),
      ...(data.product ? { product: data.product } : {}),
      device: device(),
      ...landing(),
      ...(lang ? { lang: lang.slice(0, 2) } : {}),
    });
    listen();
    if (queue.length >= SHOP_EVENTS_MAX_BATCH) flushShopEvents();
    else if (!timer) timer = setTimeout(flushShopEvents, FLUSH_MS);
  } catch {
    // Never break the page.
  }
}

function readTokens(key: string): string[] {
  try {
    const v: unknown = JSON.parse(ss()?.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeTokens(key: string, tokens: string[]): void {
  try {
    ss()?.setItem(key, JSON.stringify(tokens.slice(-20)));
  } catch {
    // Ignore.
  }
}

/** Payment is about to start for the order `token`: send now, the page navigates away next. */
export function trackPaymentStart(token: string): void {
  if (typeof window === "undefined") return;
  trackShopEvent("payment_start");
  if (token) writeTokens(PAY_KEY, [...readTokens(PAY_KEY).filter((t) => t !== token), token]);
  flushShopEvents();
}

/**
 * The order page shows `token` paid: one `paid` event, only for an order
 * whose payment started in this tab (an old order opened again is not a
 * new payment).
 */
export function trackPaidOnce(token: string): void {
  if (typeof window === "undefined" || !token) return;
  const pending = readTokens(PAY_KEY);
  if (!pending.includes(token)) return;
  writeTokens(PAY_KEY, pending.filter((t) => t !== token));
  trackShopEvent("paid");
}
