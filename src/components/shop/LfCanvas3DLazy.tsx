"use client";

import dynamic from "next/dynamic";
import type { LfCanvas3DProps } from "./LfCanvas3D";

/** `LfCanvas3D` loaded only when the 3D view is opened, so three.js stays out of the product pages' first load. */
export const LfCanvas3DLazy = dynamic<LfCanvas3DProps>(() => import("./LfCanvas3D").then((m) => m.LfCanvas3D), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full animate-pulse rounded-md"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef1f5 100%)" }}
      aria-hidden="true"
    />
  ),
});
