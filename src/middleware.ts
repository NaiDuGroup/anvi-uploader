import { NextRequest, NextResponse } from "next/server";
import {
  SHOP_PATH_HEADER,
  SHOP_REQUEST_HEADER,
  SHOP_ROBOTS_TXT,
  isShopHost,
  isShopLaunched,
  routeShopRequest,
  shopRelPath,
} from "@/lib/storefront/shopHost";

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
  let res: NextResponse;
  switch (route.kind) {
    case "redirect":
      res = NextResponse.redirect(route.location, route.status);
      break;
    case "robots":
      res = new NextResponse(SHOP_ROBOTS_TXT, {
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
      if (route.kind === "next") {
        res = NextResponse.next({ request: { headers } });
      } else {
        const url = request.nextUrl.clone();
        url.pathname = route.pathname;
        res = NextResponse.rewrite(url, { request: { headers } });
      }
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
    return NextResponse.next({ request: { headers } });
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
