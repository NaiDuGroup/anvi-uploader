import { describe, expect, it } from "vitest";
import {
  isShopHost,
  isShopRequest,
  parseShopHosts,
  primaryShopHost,
  routeShopRequest,
  shopBaseForHost,
  shopHref,
  shopLegacyRedirect,
  shopRelPath,
} from "./shopHost";
import { PS_CATEGORY_SLUG } from "./printShop/config";

const ENV = {};

describe("shop hosts", () => {
  it("defaults to anvi.md + www.anvi.md, configurable with SHOP_HOSTS", () => {
    expect(parseShopHosts(ENV)).toEqual(["anvi.md", "www.anvi.md"]);
    expect(isShopHost("anvi.md", ENV)).toBe(true);
    expect(isShopHost("WWW.anvi.md:443", ENV)).toBe(true);
    expect(isShopHost("print.anvi.md", ENV)).toBe(false);
    expect(isShopHost("localhost:3000", ENV)).toBe(false);
    expect(isShopHost("", ENV)).toBe(false);
    const env = { SHOP_HOSTS: " shop.localhost , www.shop.localhost" };
    expect(isShopHost("shop.localhost:3000", env)).toBe(true);
    expect(isShopHost("anvi.md", env)).toBe(false);
    expect(primaryShopHost(env)).toBe("shop.localhost");
    expect(primaryShopHost(ENV)).toBe("anvi.md");
  });
});

describe("routeShopRequest", () => {
  const route = (path: string, host = "anvi.md", search = "", env: Record<string, string> = ENV) =>
    routeShopRequest(host, path, search, env);

  it("redirects www to the bare domain, keeping path and query", () => {
    expect(route("/cani", "www.anvi.md", "?x=1")).toEqual({
      kind: "redirect",
      location: "https://anvi.md/cani?x=1",
      status: 308,
    });
  });

  it("rewrites storefront paths under /shop", () => {
    expect(route("/")).toEqual({ kind: "rewrite", pathname: "/shop" });
    expect(route("/cani")).toEqual({ kind: "rewrite", pathname: "/shop/cani" });
    expect(route("/p/cana-alba")).toEqual({ kind: "rewrite", pathname: "/shop/p/cana-alba" });
    expect(route("/comanda/tok")).toEqual({ kind: "rewrite", pathname: "/shop/comanda/tok" });
  });

  it("keeps /shop/... as is", () => {
    expect(route("/shop")).toEqual({ kind: "next" });
    expect(route("/shop/cos")).toEqual({ kind: "next" });
    expect(route("/shop/tester")).toEqual({ kind: "next" });
  });

  it("passes API, Next assets and public files through", () => {
    for (const p of ["/api/shop/checkout", "/api", "/_next/static/x.js", "/favicon.ico", "/favicon-32x32.png", "/logo.png", "/fonts/a.woff2"]) {
      expect(route(p)).toEqual({ kind: "pass" });
    }
  });

  it("sends the retired stock «Calendare» category to Tipografie (308, query kept)", () => {
    expect(route("/calendare")).toEqual({ kind: "redirect", location: "/tipografie", status: 308 });
    expect(route("/calendare/", "anvi.md", "?lang=ru")).toEqual({ kind: "redirect", location: "/tipografie?lang=ru", status: 308 });
    expect(shopLegacyRedirect("/calendare")).toBe(`/${PS_CATEGORY_SLUG}`);
    // The print-shop calendar products keep their pages.
    expect(route("/p/calendare-de-birou")).toEqual({ kind: "rewrite", pathname: "/shop/p/calendare-de-birou" });
    expect(route("/tipografie")).toEqual({ kind: "rewrite", pathname: "/shop/tipografie" });
    expect(shopLegacyRedirect("/calendare-de-buzunar")).toBeNull();
  });

  it("sends staff, cabinet and uploader pages to print.anvi.md with the same path", () => {
    for (const p of ["/admin", "/admin/orders", "/cabinet", "/cabinet/login", "/approve/abc", "/track/abc", "/mug/x", "/notebook/a/b", "/pen/1"]) {
      expect(route(p, "anvi.md", "?q=1")).toEqual({ kind: "redirect", location: `https://print.anvi.md${p}?q=1`, status: 307 });
    }
    // Only whole segments: /administrare would be a storefront page.
    expect(route("/administrare")).toEqual({ kind: "rewrite", pathname: "/shop/administrare" });
  });

  it("serves the bare editor paths with the storefront's shop-mode editor", () => {
    expect(route("/mug", "anvi.md", "?variant=v1")).toEqual({ kind: "rewrite", pathname: "/shop/editor/mug" });
    expect(route("/notebook")).toEqual({ kind: "rewrite", pathname: "/shop/editor/notebook" });
    expect(route("/pen/")).toEqual({ kind: "rewrite", pathname: "/shop/editor/pen" });
    // The storefront link of the editor is a plain storefront path.
    expect(route("/editor/mug")).toEqual({ kind: "rewrite", pathname: "/shop/editor/mug" });
    expect(route("/shop/editor/notebook")).toEqual({ kind: "next" });
  });

  it("robots.txt is always answered by the middleware (its text depends on SHOP_LAUNCHED)", () => {
    expect(route("/robots.txt")).toEqual({ kind: "robots" });
    expect(route("/robots.txt", "anvi.md", "", { SHOP_LAUNCHED: "1" })).toEqual({ kind: "robots" });
  });
});

describe("shop links", () => {
  it("drops /shop on the shop domain, keeps it elsewhere", () => {
    expect(shopBaseForHost("anvi.md", ENV)).toBe("");
    expect(shopBaseForHost("print.anvi.md", ENV)).toBe("/shop");
    expect(shopHref("", "/shop")).toBe("/");
    expect(shopHref("", "/shop/cos")).toBe("/cos");
    expect(shopHref("", "/shop#catalog")).toBe("/#catalog");
    expect(shopHref("", "/shop/pay/test?token=a")).toBe("/pay/test?token=a");
    expect(shopHref("", "https://pay.example/x")).toBe("https://pay.example/x");
    expect(shopHref("", "/shopping")).toBe("/shopping");
    expect(shopHref("/shop", "/shop/cos")).toBe("/shop/cos");
  });
  it("relative path is the same on both hosts", () => {
    expect(shopRelPath("/shop")).toBe("/");
    expect(shopRelPath("/shop/cos")).toBe("/cos");
    expect(shopRelPath("/cos")).toBe("/cos");
    expect(shopRelPath("/")).toBe("/");
  });
});

describe("shopLayoutMetadata", () => {
  it("noindex + anvi.md base + clean canonical during the closed test", async () => {
    const { shopLayoutMetadata } = await import("./shopMetadata");
    const m = shopLayoutMetadata("/cani", {});
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(String(m.metadataBase)).toBe("https://anvi.md/");
    expect(m.alternates).toEqual({ canonical: "/cani" });
    expect(shopLayoutMetadata(null, {}).alternates).toBeUndefined();
    expect(shopLayoutMetadata("/", { SHOP_LAUNCHED: "1" }).robots).toEqual({ index: true, follow: true });
    // print.anvi.md/shop (no clean path from the middleware): noindex even once launched.
    expect(shopLayoutMetadata(null, { SHOP_LAUNCHED: "1" }).robots).toEqual({ index: false, follow: false });
  });
});

describe("isShopRequest", () => {
  const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
  it("is true on the shop host and on /shop of other hosts only", () => {
    expect(isShopRequest(h({ "x-shop-path": "/cos" }))).toBe(true);
    expect(isShopRequest(h({ "x-shop-request": "1" }))).toBe(true);
    expect(isShopRequest(h({}))).toBe(false);
  });
});

describe("shopLayoutMetadata language", () => {
  it("gives the Russian title and description on RU pages", async () => {
    const { shopLayoutMetadata } = await import("./shopMetadata");
    const m = shopLayoutMetadata(null, {}, "ru");
    expect(m.title).toEqual({ default: "ANVI — товары с вашей печатью", template: "%s · ANVI" });
    expect(String(m.description)).toContain("Кишинёве");
  });
});
