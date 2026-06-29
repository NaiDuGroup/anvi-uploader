import { NextRequest, NextResponse } from "next/server";

const CABINET_PUBLIC_PATHS = new Set(["/cabinet/login", "/cabinet/register"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/admin/:path*", "/cabinet/:path*"],
};
