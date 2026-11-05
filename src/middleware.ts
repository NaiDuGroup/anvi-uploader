import { NextRequest, NextResponse } from "next/server";
import { SHOP_LANG_COOKIE } from "@/lib/storefront/i18n";
import {
  SHOP_PATH_HEADER,
  SHOP_REQUEST_HEADER,
  isShopHost,
  isShopLaunched,
  routeShopRequest,
  shopRelPath,
  shopRobotsTxt,
} from "@/lib/storefront/shopHost";

/** `?lang=ru` on a storefront link (e-mails): the page renders in it and the choice sticks. */
function shopLangParam(request: NextRequest): "ro" | "ru" | "en" | null {
  const v = request.nextUrl.searchParams.get("lang");
  return v === "ro" || v === "ru" || v === "en" ? v : null;
}

function withShopLangCookie(request: NextRequest, headers: Headers, lang: "ro" | "ru" | "en" | null): void {
  if (!lang) return;
  const others = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith(`${SHOP_LANG_COOKIE}=`));
  headers.set("cookie", [...others, `${SHOP_LANG_COOKIE}=${lang}`].join("; "));
}

function setShopLangCookie(res: NextResponse, lang: "ro" | "ru" | "en" | null): void {
  if (lang) res.cookies.set(SHOP_LANG_COOKIE, lang, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
}

const CABINET_PUBLIC_PATHS = new Set(["/cabinet/login", "/cabinet/register"]);

function isUnderSection(pathname: string, section: string): boolean {
  return pathname === section || pathname.startsWith(`${section}/`);
}

/**
 * Shop host (anvi.md): storefront at the root, staff pages → print.anvi.md,
 * noindex while the closed test runs. See `src/lib/storefront/shopHost.ts`.
 */
function shopHostMiddleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const route = routeShopRequest(request.headers.get("host") ?? "", pathname, search);
  const lang = shopLangParam(request);
  let res: NextResponse;
  switch (route.kind) {
    case "redirect":
      // Absolute (www, print host) or a path on this host (retired storefront paths).
      res = NextResponse.redirect(new URL(route.location, request.url), route.status);
      break;
    case "robots":
      res = new NextResponse(shopRobotsTxt(), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
      break;
    case "pass":
      res = NextResponse.next();
      break;
    case "next":
    case "rewrite": {
      const headers = new Headers(request.headers);
      headers.set(SHOP_PATH_HEADER, shopRelPath(pathname));
      withShopLangCookie(request, headers, lang);
      if (route.kind === "next") {
        res = NextResponse.next({ request: { headers } });
      } else {
        const url = request.nextUrl.clone();
        url.pathname = route.pathname;
        res = NextResponse.rewrite(url, { request: { headers } });
      }
      setShopLangCookie(res, lang);
      break;
    }
  }
  if (!isShopLaunched()) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export function middleware(request: NextRequest) {
  if (isShopHost(request.headers.get("host"))) return shopHostMiddleware(request);

  const { pathname } = request.nextUrl;
  // print.anvi.md/shop: tell the root layout it renders a storefront page (`<html lang>` = shop language).
  if (isUnderSection(pathname, "/shop")) {
    const headers = new Headers(request.headers);
    headers.set(SHOP_REQUEST_HEADER, "1");
    const lang = shopLangParam(request);
    withShopLangCookie(request, headers, lang);
    const res = NextResponse.next({ request: { headers } });
    setShopLangCookie(res, lang);
    // The storefront is indexed on anvi.md only: print.anvi.md/shop/… stays out of search, launched or not.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  // Other hosts keep the original scope (the old matcher: /admin/:path*, /cabinet/:path*).
  if (!isUnderSection(pathname, "/admin") && !isUnderSection(pathname, "/cabinet")) {
    return NextResponse.next();
  }
  const adminToken = request.cookies.get("admin_session")?.value;
  const customerToken = request.cookies.get("customer_session")?.value;

  if (pathname === "/admin/login") {
    // A signed-in customer that stumbles onto the admin login (random
    // redirect, stale bookmark) should bounce back to their cabinet instead
    // of seeing a staff-only screen they can never use.
    if (customerToken && !adminToken) {
      return NextResponse.redirect(new URL("/cabinet", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (adminToken) {
      return NextResponse.next();
    }
    // Logged-in customer accidentally inside the admin area -> back to cabinet.
    if (customerToken) {
      return NextResponse.redirect(new URL("/cabinet", request.url));
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (pathname.startsWith("/cabinet")) {
    if (CABINET_PUBLIC_PATHS.has(pathname)) {
      // A signed-in staff member on the customer login/register should go to
      // their own dashboard rather than be asked to sign in again.
      if (adminToken && !customerToken) {
        return NextResponse.redirect(new URL("/admin/orders", request.url));
      }
      return NextResponse.next();
    }
    if (customerToken) {
      return NextResponse.next();
    }
    // Staff (no customer session) inside protected cabinet pages -> admin.
    if (adminToken) {
      return NextResponse.redirect(new URL("/admin/orders", request.url));
    }
    const loginUrl = new URL("/cabinet/login", request.url);
    const back = pathname + request.nextUrl.search;
    if (back && back !== "/cabinet") {
      loginUrl.searchParams.set("redirect", back);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Every path but the API and Next build assets: shop hosts route all pages
  // (and /robots.txt); other hosts only act on /admin and /cabinet above.
  matcher: ["/((?!api/|_next/static/|_next/image).*)"],
};
