import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

function call(url: string, cookies: Record<string, string> = {}) {
  const u = new URL(url);
  const headers = new Headers({ host: u.host });
  const c = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (c) headers.set("cookie", c);
  return middleware(new NextRequest(u, { headers }));
}

afterEach(() => vi.unstubAllEnvs());

describe("middleware — shop host (anvi.md)", () => {
  it("rewrites / and /x to the storefront, with noindex and the clean path header", () => {
    const home = call("https://anvi.md/");
    expect(new URL(home.headers.get("x-middleware-rewrite")!).pathname).toBe("/shop");
    expect(home.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(home.headers.get("x-middleware-request-x-shop-path")).toBe("/");

    const cat = call("https://anvi.md/cani?sort=1");
    const target = new URL(cat.headers.get("x-middleware-rewrite")!);
    expect(target.pathname).toBe("/shop/cani");
    expect(target.search).toBe("?sort=1");
    expect(cat.headers.get("x-middleware-request-x-shop-path")).toBe("/cani");
  });

  it("keeps /shop/... without a rewrite", () => {
    const res = call("https://anvi.md/shop/cos");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-request-x-shop-path")).toBe("/cos");
  });

  it("redirects www → anvi.md", () => {
    const res = call("https://www.anvi.md/p/cana-alba?a=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://anvi.md/p/cana-alba?a=1");
  });

  it("sends /admin and the cabinet to print.anvi.md, even with a session cookie", () => {
    const admin = call("https://anvi.md/admin/orders?x=1", { admin_session: "t" });
    expect(admin.status).toBe(307);
    expect(admin.headers.get("location")).toBe("https://print.anvi.md/admin/orders?x=1");
    expect(call("https://anvi.md/cabinet/login").headers.get("location")).toBe("https://print.anvi.md/cabinet/login");
    expect(call("https://anvi.md/track/abc").headers.get("location")).toBe("https://print.anvi.md/track/abc");
  });

  it("serves robots.txt Disallow: / during the closed test", async () => {
    const res = call("https://anvi.md/robots.txt");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("launched (SHOP_LAUNCHED=1): no noindex header, robots.txt passes through", () => {
    vi.stubEnv("SHOP_LAUNCHED", "1");
    expect(call("https://anvi.md/").headers.get("x-robots-tag")).toBeNull();
    expect(call("https://anvi.md/robots.txt").headers.get("x-middleware-next")).toBe("1");
  });

  it("honours SHOP_HOSTS", () => {
    vi.stubEnv("SHOP_HOSTS", "shop.localhost");
    expect(new URL(call("http://shop.localhost:3000/cani").headers.get("x-middleware-rewrite")!).pathname).toBe("/shop/cani");
    // anvi.md is then an ordinary host.
    expect(call("https://anvi.md/cani").headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("middleware — print.anvi.md (unchanged)", () => {
  const P = "https://print.anvi.md";

  it("leaves the uploader, /shop and robots.txt alone (no rewrite, no noindex)", () => {
    for (const path of ["/", "/mug", "/track/abc", "/shop", "/shop/cani", "/robots.txt", "/administrare"]) {
      const res = call(P + path);
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
      expect(res.headers.get("x-middleware-rewrite"), path).toBeNull();
      expect(res.headers.get("x-robots-tag"), path).toBeNull();
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("admin: login when signed out, through with a session, cabinet for a customer", () => {
    expect(call(`${P}/admin/orders`).headers.get("location")).toBe(`${P}/admin/login`);
    expect(call(`${P}/admin`).headers.get("location")).toBe(`${P}/admin/login`);
    expect(call(`${P}/admin/orders`, { admin_session: "t" }).headers.get("x-middleware-next")).toBe("1");
    expect(call(`${P}/admin/orders`, { customer_session: "c" }).headers.get("location")).toBe(`${P}/cabinet`);
    expect(call(`${P}/admin/login`).headers.get("x-middleware-next")).toBe("1");
    expect(call(`${P}/admin/login`, { customer_session: "c" }).headers.get("location")).toBe(`${P}/cabinet`);
  });

  it("cabinet: login redirect keeps the target; staff go to admin", () => {
    expect(call(`${P}/cabinet/orders?p=2`).headers.get("location")).toBe(
      `${P}/cabinet/login?redirect=${encodeURIComponent("/cabinet/orders?p=2")}`,
    );
    expect(call(`${P}/cabinet`).headers.get("location")).toBe(`${P}/cabinet/login`);
    expect(call(`${P}/cabinet/login`, { admin_session: "t" }).headers.get("location")).toBe(`${P}/admin/orders`);
    expect(call(`${P}/cabinet/orders`, { customer_session: "c" }).headers.get("x-middleware-next")).toBe("1");
  });

  it("localhost behaves like print.anvi.md", () => {
    expect(call("http://localhost:3000/shop").headers.get("x-middleware-rewrite")).toBeNull();
    expect(call("http://localhost:3000/admin").headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("matcher skips the API and Next build assets", () => {
    const re = new RegExp(`^${config.matcher[0]!.replace("/((?!", "/(?!").replace(").*)", ").*")}$`);
    expect(re.test("/api/shop/checkout")).toBe(false);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/admin/orders")).toBe(true);
    expect(re.test("/robots.txt")).toBe(true);
    expect(re.test("/")).toBe(true);
  });
});
