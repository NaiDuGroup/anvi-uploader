import type { NextConfig } from "next";

// One build time for the whole build: `next build` loads this config again in
// its server / client build workers, and a fresh `new Date()` in each gave the
// server and browser bundles different times → the admin footer text did not
// match on hydration (React #418). Workers inherit the parent's env.
if (process.env.VERCEL && !process.env.ANVI_BUILD_TIME) {
  process.env.ANVI_BUILD_TIME = new Date().toISOString();
}

const nextConfig: NextConfig = {
  /** Admin footer build line: short commit + build time (Vercel sets the SHA; locally both stay empty → «dev»). */
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
    NEXT_PUBLIC_BUILD_TIME: process.env.ANVI_BUILD_TIME ?? "",
  },
  allowedDevOrigins: ["192.168.100.246", "192.168.0.42", "localhost"],
  /** Prisma delegates expose `*.fields` for schema introspection; webpack bundling can omit it and break readiness checks. */
  /** Native canvas used by pdf.js to rasterise PDF artwork for sheet-product layouts. */
  serverExternalPackages: ["@prisma/client", "@napi-rs/canvas"],
  /** Import documents: pdf.js is loaded at runtime (not bundled) to read supplier PDFs; ship its Node build with those routes. */
  outputFileTracingIncludes: {
    "/api/admin/imports/**": ["./node_modules/pdfjs-dist/legacy/build/**"],
    /** Costing report PDF reads its fonts from disk at runtime. */
    "/api/admin/imports/[id]/report": ["./public/fonts/**"],
    /** Storefront link-preview images (`opengraph-image`): Noto Sans + the logo, read from disk. */
    "/shop/opengraph-image*": ["./public/fonts/NotoSans-*.ttf", "./public/logo.png"],
    "/shop/**/opengraph-image*": ["./public/fonts/NotoSans-*.ttf", "./public/logo.png"],
  },
};

export default nextConfig;
