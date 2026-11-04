import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { shopLoginUrl } from "@/lib/email/shopNotify";
import { SHOP_STRING_KEYS, shopT } from "./i18n";
import { orderInfo } from "./recentOrders";
import { routeShopRequest } from "./shopHost";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

function call(url: string, cookie?: string) {
  const u = new URL(url);
  const headers = new Headers({ host: u.host });
  if (cookie) headers.set("cookie", cookie);
  return middleware(new NextRequest(u, { headers }));
}

describe("storefront 404", () => {
  it("/sitemap.xml goes to the storefront (its 404), other public files still pass", () => {
    expect(routeShopRequest("anvi.md", "/sitemap.xml", "")).toEqual({ kind: "rewrite", pathname: "/shop/sitemap.xml" });
    expect(routeShopRequest("anvi.md", "/logo.png", "")).toEqual({ kind: "pass" });
    expect(routeShopRequest("anvi.md", "/ru", "")).toEqual({ kind: "rewrite", pathname: "/shop/ru" });
  });

  it("print.anvi.md keeps its own routing (no shop rewrite)", () => {
    const res = call("https://print.anvi.md/nu-exista-pagina");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("has its texts in every language", () => {
    for (const lang of ["ro", "ru", "en"] as const) {
      const t = shopT(lang);
      for (const k of ["notFoundTitle", "notFoundText", "notFoundHome", "notFoundCatalog", "errEmailEmpty", "navAccount", "navOrders"] as const) {
        expect(SHOP_STRING_KEYS).toContain(k);
        expect(t(k).length).toBeGreaterThan(1);
      }
    }
    expect(shopT("ro")("errEmailEmpty")).toBe("Scrie adresa de e-mail");
  });
});

describe("?lang= on storefront links (e-mail links open in the e-mail's language)", () => {
  it("the login link carries the language", () => {
    expect(shopLoginUrl("abc", "ru", { SHOP_HOSTS: "anvi.md" })).toBe("https://anvi.md/cont/verifica?token=abc&lang=ru");
    expect(shopLoginUrl("abc", undefined, { SHOP_HOSTS: "anvi.md" })).toBe("https://anvi.md/cont/verifica?token=abc");
  });

  it("shop host: the page renders in it and the cookie is set", () => {
    const res = call("https://anvi.md/cont/verifica?token=x&lang=ru", "shop_lang=ro; other=1");
    expect(res.headers.get("x-middleware-request-cookie")).toBe("other=1; shop_lang=ru");
    expect(res.cookies.get("shop_lang")?.value).toBe("ru");
  });

  it("print.anvi.md/shop does the same; an unknown value is ignored", () => {
    const res = call("https://print.anvi.md/shop/cont/verifica?lang=en");
    expect(res.headers.get("x-middleware-request-cookie")).toBe("shop_lang=en");
    expect(res.cookies.get("shop_lang")?.value).toBe("en");
    const bad = call("https://anvi.md/cont?lang=de", "shop_lang=ro");
    expect(bad.cookies.get("shop_lang")).toBeUndefined();
  });
});

describe("«Comenzile mele»: status and amount", () => {
  it("reads them from the order answer", () => {
    expect(orderInfo({ status: "paid", total: 280 })).toEqual({ status: "paid", total: 280 });
    expect(orderInfo({ status: "weird", total: 280 })).toBeNull();
    expect(orderInfo({ status: "paid" })).toBeNull();
    expect(orderInfo(null)).toBeNull();
  });
});
