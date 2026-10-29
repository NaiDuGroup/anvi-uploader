import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.100.246", "192.168.0.42", "localhost"],
  /** Prisma delegates expose `*.fields` for schema introspection; webpack bundling can omit it and break readiness checks. */
  /** Native canvas used by pdf.js to rasterise PDF artwork for sheet-product layouts. */
  serverExternalPackages: ["@prisma/client", "@napi-rs/canvas"],
  /** Import documents: pdf.js is loaded at runtime (not bundled) to read supplier PDFs; ship its Node build with those routes. */
  outputFileTracingIncludes: {
    "/api/admin/imports/**": ["./node_modules/pdfjs-dist/legacy/build/**"],
    /** Costing report PDF reads its fonts from disk at runtime. */
    "/api/admin/imports/[id]/report": ["./public/fonts/**"],
  },
};

export default nextConfig;
