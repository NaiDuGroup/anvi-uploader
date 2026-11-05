import { describe, expect, it } from "vitest";
import { SHOP_REPORT_CATEGORIES } from "@/lib/shop/lineProduct";
import {
  SHOP_EVENTS_MAX_BATCH,
  SHOP_EVENT_CATEGORIES,
  browserOptsOut,
  cleanPath,
  cleanReferrerDomain,
  isBotUserAgent,
  parseShopEvent,
  parseShopEventBatch,
  requestOptsOut,
  shopPageOf,
} from "./events";

const KNOWN: Record<string, string> = { "cana-alba": "cani", flyere: "tipografie" };
const known = (slug: string) => KNOWN[slug];
const SID = "a1b2c3d4e5f60718";
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("event validation", () => {
  it("keeps a valid event and resolves the product category on the server", () => {
    const row = parseShopEvent(
      {
        type: "page_view",
        sid: SID,
        path: "/p/cana-alba?utm_source=fb#x",
        product: "cana-alba",
        category: "genti", // a client-sent category never overrides the product's own
        device: "mobile",
        ref: "www.Google.com",
        utmSource: " Facebook ",
        utmMedium: "cpc",
        utmCampaign: "craciun-2026",
        lang: "ru",
      },
      known,
    );
    expect(row).toEqual({
      sessionId: SID,
      type: "page_view",
      path: "/p/cana-alba",
      category: "cani",
      product: "cana-alba",
      device: "mobile",
      referrer: "google.com",
      utmSource: "facebook",
      utmMedium: "cpc",
      utmCampaign: "craciun-2026",
      lang: "ru",
    });
  });

  it("drops unknown products and categories, junk fields; never keeps IP or UA fields", () => {
    const row = parseShopEvent(
      { type: "add_to_cart", sid: SID, product: "nu-exista", category: "<script>", device: "tv", ip: "1.2.3.4", ua: CHROME, lang: "de" },
      known,
    );
    expect(row).toMatchObject({ product: null, category: null, device: null, lang: null });
    expect(Object.keys(row!)).not.toContain("ip");
    expect(Object.keys(row!)).not.toContain("ua");
  });

  it("keeps a category page's category", () => {
    expect(parseShopEvent({ type: "page_view", sid: SID, category: "cani" }, known)?.category).toBe("cani");
  });

  it("rejects bad types and session ids", () => {
    expect(parseShopEvent({ type: "purchase", sid: SID }, known)).toBeNull();
    expect(parseShopEvent({ type: "paid", sid: "short" }, known)).toBeNull();
    expect(parseShopEvent({ type: "paid", sid: "x".repeat(65) }, known)).toBeNull();
    expect(parseShopEvent({ type: "paid", sid: "bad id with spaces" }, known)).toBeNull();
    expect(parseShopEvent(null, known)).toBeNull();
  });

  it("batches: shape checked, capped, invalid events dropped", () => {
    expect(parseShopEventBatch({ nope: [] }, known)).toBeNull();
    expect(parseShopEventBatch("x", known)).toBeNull();
    const many = Array.from({ length: 50 }, () => ({ type: "page_view", sid: SID }));
    expect(parseShopEventBatch({ events: many }, known)).toHaveLength(SHOP_EVENTS_MAX_BATCH);
    expect(parseShopEventBatch({ events: [{ type: "paid", sid: SID }, { type: "x", sid: SID }] }, known)).toHaveLength(1);
  });

  it("paths lose the query and the order page's secret token", () => {
    expect(cleanPath("/comanda/AbC123secret")).toBe("/comanda/:token");
    expect(cleanPath("/shop/comanda/AbC123secret/x?y=1")).toBe("/shop/comanda/:token/x");
    expect(cleanPath("/cont/comenzi/1234")).toBe("/cont/comenzi/:n");
    expect(cleanPath("https://evil.example/")).toBeNull();
    expect(cleanPath("//evil.example/")).toBeNull();
  });

  it("referrer must be a hostname", () => {
    expect(cleanReferrerDomain("l.facebook.com")).toBe("l.facebook.com");
    expect(cleanReferrerDomain("https://google.com/search")).toBeNull();
    expect(cleanReferrerDomain("localhost")).toBeNull();
  });
});

describe("bots", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "TelegramBot (like TwitterBot)",
    "WhatsApp/2.23.20.0",
    "curl/8.4.0",
    "python-requests/2.31",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "",
  ])("%s is a bot", (ua) => expect(isBotUserAgent(ua)).toBe(true));

  it.each([CHROME, IPHONE, "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"])(
    "%s is a person",
    (ua) => expect(isBotUserAgent(ua)).toBe(false),
  );
});

describe("Do Not Track / GPC", () => {
  it("request headers", () => {
    expect(requestOptsOut(new Headers({ dnt: "1" }))).toBe(true);
    expect(requestOptsOut(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(requestOptsOut(new Headers({ dnt: "0" }))).toBe(false);
    expect(requestOptsOut(new Headers())).toBe(false);
  });
  it("browser signals", () => {
    expect(browserOptsOut({ doNotTrack: "1" })).toBe(true);
    expect(browserOptsOut({ globalPrivacyControl: true })).toBe(true);
    expect(browserOptsOut({ doNotTrack: null }, { doNotTrack: "1" })).toBe(true);
    expect(browserOptsOut({ doNotTrack: "unspecified", globalPrivacyControl: false })).toBe(false);
    expect(browserOptsOut(null)).toBe(true);
  });
});

describe("storefront pages", () => {
  it("parses both hosts' paths", () => {
    expect(shopPageOf("/p/cana-alba")).toEqual({ path: "/p/cana-alba", product: "cana-alba" });
    expect(shopPageOf("/shop/p/cana-alba/")).toEqual({ path: "/p/cana-alba", product: "cana-alba" });
    expect(shopPageOf("/cani")).toEqual({ path: "/cani", category: "cani" });
    expect(shopPageOf("/shop/tipografie")).toEqual({ path: "/tipografie", category: "tipografie" });
    expect(shopPageOf("/printare")).toEqual({ path: "/printare", category: "printare", product: "printare" });
    expect(shopPageOf("/cos")).toEqual({ path: "/cos", step: "cart_view" });
    expect(shopPageOf("/shop/checkout")).toEqual({ path: "/checkout", step: "checkout_start" });
    expect(shopPageOf("/shop")).toEqual({ path: "/" });
    expect(shopPageOf("/despre")).toEqual({ path: "/despre" });
  });

  it("the tracker's category list matches the report's", () => {
    expect([...SHOP_EVENT_CATEGORIES].sort()).toEqual(SHOP_REPORT_CATEGORIES.map((c) => c.slug).sort());
  });
});
