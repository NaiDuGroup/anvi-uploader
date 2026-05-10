import { NextRequest, NextResponse } from "next/server";

const CABINET_PUBLIC_PATHS = new Set(["/cabinet/login", "/cabinet/register"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const sessionToken = request.cookies.get("admin_session")?.value;
    if (!sessionToken) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/cabinet")) {
    if (CABINET_PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    const customerToken = request.cookies.get("customer_session")?.value;
    if (!customerToken) {
      const loginUrl = new URL("/cabinet/login", request.url);
      const back = pathname + request.nextUrl.search;
      if (back && back !== "/cabinet") {
        loginUrl.searchParams.set("redirect", back);
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/cabinet/:path*"],
};
