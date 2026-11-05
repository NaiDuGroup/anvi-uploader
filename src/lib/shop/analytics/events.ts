/**
 * First-party storefront funnel events: the wire format of `POST /api/shop/e`,
 * its validation, the bot / Do-Not-Track checks and the storefront path →
 * page parsing. No cookies, no IP, no user agent stored. Pure (client-safe).
 */

export const SHOP_EVENT_TYPES = [
  "page_view",
  "add_to_cart",
  "cart_view",
  "checkout_start",
  "payment_start",
  "paid",
] as const;
export type ShopEventType = (typeof SHOP_EVENT_TYPES)[number];

export const SHOP_EVENT_DEVICES = ["mobile", "desktop"] as const;
export type ShopEventDevice = (typeof SHOP_EVENT_DEVICES)[number];

/** Events per beacon (the tracker flushes well before). */
export const SHOP_EVENTS_MAX_BATCH = 20;
/** Request body limit, bytes. */
export const SHOP_EVENTS_MAX_BODY = 16_384;
/** Events are deleted after this many days (`/api/cron/shop-events-retention`). */
export const SHOP_EVENTS_RETENTION_DAYS = 180;

/**
 * Category slugs a page view may carry: the catalog categories and the
 * print-shop sections (same list as `SHOP_REPORT_CATEGORIES` in
 * `src/lib/shop/lineProduct.ts`, kept here so the tracker stays small).
 */
export const SHOP_EVENT_CATEGORIES: readonly string[] = [
  "caiete",
  "cani",
  "tricouri",
  "pixuri",
  "genti",
  "jucarii",
  "sticle",
  "jocuri",
  "craciun",
  "cadouri",
  "tipografie",
  "carti-de-vizita",
  "printare",
  "print-mare-format",
];

/** Section pages that are a product form themselves (the page is the product). */
const PRODUCT_SECTIONS: ReadonlySet<string> = new Set(["printare", "carti-de-vizita"]);

/** One event as the tracker sends it. */
export interface ShopEventInput {
  type: ShopEventType;
  /** Random per-tab session id (sessionStorage). */
  sid: string;
  path?: string;
  category?: string;
  product?: string;
  device?: ShopEventDevice;
  /** Referrer domain (external only), captured on landing. */
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  lang?: string;
}

/** A validated event, ready to store (`ShopEvent` columns). */
export interface ShopEventRow {
  sessionId: string;
  type: ShopEventType;
  path: string | null;
  category: string | null;
  product: string | null;
  device: ShopEventDevice | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  lang: string | null;
}

const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const HOST_RE = /^(?=.{1,100}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** utm values: trimmed, lower-cased, printable, ≤ 100 chars; null when empty. */
export function cleanUtm(v: unknown): string | null {
  const s = str(v)?.trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, "") ?? "";
  return s ? s.slice(0, 100) : null;
}

/** A referrer domain: a hostname without `www.`; null when not one. */
export function cleanReferrerDomain(v: unknown): string | null {
  const s = str(v)?.trim().toLowerCase().replace(/^www\./, "") ?? "";
  return HOST_RE.test(s) ? s : null;
}

/**
 * Secret / personal path parts replaced by a placeholder: the order page's
 * secret token (`/comanda/<token>` is the order link itself) and account
 * order numbers.
 */
export function redactShopPath(path: string): string {
  return path
    .replace(/^((?:\/shop)?\/comanda\/)[^/]+/, "$1:token")
    .replace(/^((?:\/shop)?\/cont\/comenzi\/)[^/]+/, "$1:n");
}

/** A storefront path without query / hash or secrets, ≤ 200 chars; null when not a path. */
export function cleanPath(v: unknown): string | null {
  const s = str(v);
  if (!s || !s.startsWith("/") || s.startsWith("//")) return null;
  const p = redactShopPath(s.split(/[?#]/)[0]!.replace(/[\u0000-\u001f\u007f]/g, ""));
  return p.slice(0, 200) || null;
}

/**
 * Validate one raw event. `resolveProduct`: product slug → its category, or
 * undefined for an unknown product (then dropped). Unknown categories are
 * dropped; the type and the session id are required.
 */
export function parseShopEvent(
  raw: unknown,
  resolveProduct: (slug: string) => string | null | undefined,
): ShopEventRow | null {
  if (raw == null || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const type = str(e.type);
  const sid = str(e.sid);
  if (!type || !(SHOP_EVENT_TYPES as readonly string[]).includes(type)) return null;
  if (!sid || !SID_RE.test(sid)) return null;
  const productRaw = str(e.product)?.trim().toLowerCase() ?? null;
  let product: string | null = null;
  let category: string | null = null;
  if (productRaw && SLUG_RE.test(productRaw)) {
    const cat = resolveProduct(productRaw);
    if (cat !== undefined) {
      product = productRaw;
      category = cat;
    }
  }
  if (!category) {
    const c = str(e.category)?.trim().toLowerCase() ?? null;
    if (c && SHOP_EVENT_CATEGORIES.includes(c)) category = c;
  }
  const device = str(e.device);
  const lang = str(e.lang);
  return {
    sessionId: sid,
    type: type as ShopEventType,
    path: cleanPath(e.path),
    category,
    product,
    device: device && (SHOP_EVENT_DEVICES as readonly string[]).includes(device) ? (device as ShopEventDevice) : null,
    referrer: cleanReferrerDomain(e.ref),
    utmSource: cleanUtm(e.utmSource),
    utmMedium: cleanUtm(e.utmMedium),
    utmCampaign: cleanUtm(e.utmCampaign),
    lang: lang === "ro" || lang === "ru" || lang === "en" ? lang : null,
  };
}

/** The beacon body `{ events: [...] }` → valid rows (at most {@link SHOP_EVENTS_MAX_BATCH}); null when not that shape. */
export function parseShopEventBatch(
  body: unknown,
  resolveProduct: (slug: string) => string | null | undefined,
): ShopEventRow[] | null {
  if (body == null || typeof body !== "object") return null;
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  return events
    .slice(0, SHOP_EVENTS_MAX_BATCH)
    .map((e) => parseShopEvent(e, resolveProduct))
    .filter((e): e is ShopEventRow => e != null);
}

/** Crawlers, link previews, monitors, headless browsers and HTTP libraries. */
const BOT_UA_RE =
  /bot\b|bot\/|crawl|spider|slurp|bingpreview|mediapartners|facebookexternalhit|facebookcatalog|embedly|quora link preview|telegrambot|skypeuripreview|slackbot|discordbot|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|python-requests|python-urllib|aiohttp|curl\/|wget|httpclient|okhttp|axios|node-fetch|undici|go-http-client|java\/|libwww|phantomjs|selenium|puppeteer|playwright|scrapy/i;

/** A known bot user agent (an empty one, or one that is not a browser at all, counts as a bot). */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  if (s === "" || BOT_UA_RE.test(s)) return true;
  // Link previews of messengers (WhatsApp/2.23, Viber/…) send no browser token.
  return !/mozilla\/|opera\//i.test(s);
}

/** The request asks not to be tracked: `DNT: 1` or `Sec-GPC: 1`. */
export function requestOptsOut(headers: Pick<Headers, "get">): boolean {
  return headers.get("dnt")?.trim() === "1" || headers.get("sec-gpc")?.trim() === "1";
}

/** Browser-side: Do Not Track / Global Privacy Control set. */
export function browserOptsOut(nav: {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
  msDoNotTrack?: string | null;
} | null | undefined, win?: { doNotTrack?: string | null } | null): boolean {
  if (!nav) return true;
  if (nav.globalPrivacyControl === true) return true;
  return nav.doNotTrack === "1" || nav.doNotTrack === "yes" || nav.msDoNotTrack === "1" || win?.doNotTrack === "1";
}

/**
 * A storefront path (`/shop/p/cana` on print.anvi.md, `/p/cana` on anvi.md)
 * → what the page is: a product (`/p/<slug>`, `/printare`, `/carti-de-vizita`),
 * a category, the cart or the checkout.
 */
export function shopPageOf(pathname: string): {
  path: string;
  product?: string;
  category?: string;
  step?: "cart_view" | "checkout_start";
} {
  let p = (pathname.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "") || "/";
  if (p === "/shop") p = "/";
  else if (p.startsWith("/shop/")) p = p.slice(5);
  const segs = p.split("/").filter(Boolean);
  if (segs[0] === "p" && segs[1] && segs.length === 2) {
    const slug = segs[1].toLowerCase();
    return SLUG_RE.test(slug) ? { path: p, product: slug } : { path: p };
  }
  if (segs.length === 1) {
    const s = segs[0]!.toLowerCase();
    if (s === "cos") return { path: p, step: "cart_view" };
    if (s === "checkout") return { path: p, step: "checkout_start" };
    if (SHOP_EVENT_CATEGORIES.includes(s)) {
      return PRODUCT_SECTIONS.has(s) ? { path: p, category: s, product: s } : { path: p, category: s };
    }
  }
  return { path: p };
}
