import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.100.246", "192.168.0.42", "localhost"],
  /** Prisma delegates expose `*.fields` for schema introspection; webpack bundling can omit it and break readiness checks. */
  /** pdf.js + its native canvas rasterise PDF artwork for sheet-product layouts. */
  serverExternalPackages: ["@prisma/client", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
