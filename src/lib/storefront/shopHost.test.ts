import { describe, expect, it } from "vitest";
import {
  isShopHost,
  parseShopHosts,
  primaryShopHost,
  routeShopRequest,
  shopBaseForHost,
  shopHref,
  shopRelPath,
} from "./shopHost";

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
    for (const p of ["/api/shop/checkout", "/api", "/_next/static/x.js", "/favicon.ico", "/favicon-32x32.png", "/logo.png", "/fonts/a.woff2", "/sitemap.xml"]) {
      expect(route(p)).toEqual({ kind: "pass" });
    }
  });

  it("sends staff, cabinet and uploader pages to print.anvi.md with the same path", () => {
    for (const p of ["/admin", "/admin/orders", "/cabinet", "/cabinet/login", "/approve/abc", "/track/abc", "/mug", "/notebook", "/pen"]) {
      expect(route(p, "anvi.md", "?q=1")).toEqual({ kind: "redirect", location: `https://print.anvi.md${p}?q=1`, status: 307 });
    }
    // Only whole segments: /administrare would be a storefront page.
    expect(route("/administrare")).toEqual({ kind: "rewrite", pathname: "/shop/administrare" });
  });

  it("robots.txt: Disallow during the closed test, passes through once launched", () => {
    expect(route("/robots.txt")).toEqual({ kind: "robots" });
    expect(route("/robots.txt", "anvi.md", "", { SHOP_LAUNCHED: "1" })).toEqual({ kind: "pass" });
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
    expect(shopLayoutMetadata("/", { SHOP_LAUNCHED: "1" }).robots).toBeUndefined();
  });
});
